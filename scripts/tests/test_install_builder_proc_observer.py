import importlib.util
import os
from pathlib import Path
import shutil
import tempfile
import unittest
from unittest.mock import patch


INSTALLER_PATH = (Path(__file__).resolve().parents[1] /
                  "install-capacity-proc-observer-builder-a838bd33.py")
SPEC = importlib.util.spec_from_file_location("builder_installer", INSTALLER_PATH)
installer = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(installer)


class BuilderObserverInstaller(unittest.TestCase):
    def setUp(self):
        temp = Path(self.enterContext(tempfile.TemporaryDirectory()))
        base = temp / "usr-local"
        base.mkdir(mode=0o755)
        custody = temp / "custody"
        custody.mkdir(mode=0o700)
        installer_copy = custody / INSTALLER_PATH.name
        source = custody / "capacity-proc-observer-builder-a838bd33.py"
        shutil.copyfile(INSTALLER_PATH, installer_copy)
        shutil.copyfile(Path(__file__).resolve().parents[1] /
                        "capacity-proc-observer-builder-a838bd33.py", source)
        installer_copy.chmod(0o600)
        source.chmod(0o600)
        target = base / "libexec/re7online/capacity-proc-observer.py"
        self.enterContext(patch.multiple(
            installer, INSTALLER=installer_copy, SOURCE=source,
            SOURCE_SHA256=installer.digest(source.read_bytes()), TARGET_BASE=base,
            TARGET=target,
            TEMPORARY=target.with_name(".capacity-proc-observer.py.a838bd33.installing"),
            ROOT_UID=os.getuid(), ROOT_GID=os.getgid()))
        self.target = target

    def test_install_and_recover_without_sudoers_change(self):
        first = installer.install()
        self.assertEqual(first["state"], "INSTALLED")
        self.assertEqual(first["helper"]["mode"], "0500")
        self.assertFalse(first["sudoersChanged"])
        inode = first["helper"]["inode"]
        second = installer.install()
        self.assertEqual(second["state"], "RECOVERED")
        self.assertEqual(second["helper"]["inode"], inode)
        self.assertEqual(second["createdDirectories"], [])

    def test_foreign_existing_target_is_denied(self):
        self.target.parent.mkdir(parents=True, mode=0o755)
        self.target.write_bytes(b"foreign")
        self.target.chmod(0o500)
        with self.assertRaisesRegex(RuntimeError, "IDENTITY"):
            installer.install()
        self.assertEqual(self.target.read_bytes(), b"foreign")

    def test_source_hash_is_required(self):
        installer.SOURCE.write_bytes(b"tampered")
        with self.assertRaisesRegex(RuntimeError, "IDENTITY"):
            installer.install()
        self.assertFalse(self.target.exists())

    def test_resume_after_directory_creation_before_fsync(self):
        with patch.object(installer.os, "fsync", side_effect=OSError("interrupted")), \
                patch.object(installer.os, "write") as write, \
                self.assertRaisesRegex(OSError, "interrupted"):
            installer.main()
        write.assert_not_called()
        first_parent = installer.TARGET_BASE / "libexec"
        self.assertTrue(first_parent.is_dir())
        self.assertFalse(self.target.exists())

        result = installer.install()
        self.assertEqual(result["state"], "INSTALLED")
        self.assertEqual(result["helper"]["sha256"], installer.SOURCE_SHA256)
        self.assertTrue(self.target.is_file())

    def test_resume_after_interrupted_temporary_write(self):
        real_write = os.write
        reports: list[bytes] = []
        interrupted = False

        def interrupt_file_write(descriptor, value):
            nonlocal interrupted
            if descriptor == 1:
                reports.append(bytes(value))
                return len(value)
            if not interrupted:
                interrupted = True
                partial = bytes(value[:17])
                real_write(descriptor, partial)
                raise OSError("interrupted-before-publication")
            return real_write(descriptor, value)

        with patch.object(installer.os, "write", side_effect=interrupt_file_write), \
                self.assertRaisesRegex(OSError, "interrupted-before-publication"):
            installer.main()
        self.assertEqual(reports, [])
        self.assertFalse(self.target.exists())
        self.assertTrue(installer.TEMPORARY.exists())

        result = installer.install()
        self.assertEqual(result["state"], "INSTALLED")
        self.assertEqual(result["helper"]["sha256"], installer.SOURCE_SHA256)
        self.assertTrue(self.target.is_file())
        self.assertFalse(installer.TEMPORARY.exists())

    def test_resume_syncs_complete_temporary_before_atomic_publication(self):
        real_fsync = os.fsync
        interrupted = False

        def interrupt_before_temporary_fsync(descriptor):
            nonlocal interrupted
            current = os.fstat(descriptor)
            if (installer.TEMPORARY.exists() and
                    current.st_ino == installer.TEMPORARY.stat().st_ino and
                    not interrupted):
                interrupted = True
                raise OSError("interrupted-before-temporary-fsync")
            return real_fsync(descriptor)

        with patch.object(installer.os, "fsync", side_effect=interrupt_before_temporary_fsync), \
                self.assertRaisesRegex(OSError, "interrupted-before-temporary-fsync"):
            installer.install()
        self.assertTrue(interrupted)
        self.assertFalse(self.target.exists())
        self.assertEqual(installer.TEMPORARY.read_bytes(), installer.SOURCE.read_bytes())

        temporary_synced = False
        real_link = os.link

        def track_fsync(descriptor):
            nonlocal temporary_synced
            current = os.fstat(descriptor)
            if (installer.TEMPORARY.exists() and
                    current.st_ino == installer.TEMPORARY.stat().st_ino):
                temporary_synced = True
            return real_fsync(descriptor)

        def require_sync_before_link(source, destination, **kwargs):
            self.assertTrue(temporary_synced)
            return real_link(source, destination, **kwargs)

        with patch.object(installer.os, "fsync", side_effect=track_fsync), \
                patch.object(installer.os, "link", side_effect=require_sync_before_link):
            result = installer.install()
        self.assertEqual(result["state"], "INSTALLED")
        self.assertEqual(result["helper"]["sha256"], installer.SOURCE_SHA256)
        self.assertTrue(self.target.is_file())
        self.assertFalse(installer.TEMPORARY.exists())

    def test_resume_after_atomic_publication_before_temporary_unlink(self):
        installer.ensure_target_parent()
        source_raw = installer.SOURCE.read_bytes()
        installer.write_temporary(source_raw)
        os.link(installer.TEMPORARY, self.target, follow_symlinks=False)
        self.assertEqual(self.target.stat().st_nlink, 2)

        result = installer.install()
        self.assertEqual(result["state"], "RECOVERED")
        self.assertEqual(result["helper"]["sha256"], installer.SOURCE_SHA256)
        self.assertEqual(self.target.stat().st_nlink, 1)
        self.assertFalse(installer.TEMPORARY.exists())


if __name__ == "__main__":
    unittest.main()

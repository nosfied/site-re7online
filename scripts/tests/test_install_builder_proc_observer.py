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
            TARGET=target, ROOT_UID=os.getuid(), ROOT_GID=os.getgid()))
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


if __name__ == "__main__":
    unittest.main()

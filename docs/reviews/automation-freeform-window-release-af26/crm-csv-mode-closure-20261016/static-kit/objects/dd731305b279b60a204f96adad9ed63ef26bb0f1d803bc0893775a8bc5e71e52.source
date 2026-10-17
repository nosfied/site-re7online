"""Future authenticated preparation module; immutable PM2 configuration input.
No installation, CLI, disk spool, stdin chunks or mutable CJS execution.
Loaded only through the phase Loader; root alias/toolchain provisioning is B4.
"""
import fcntl
import os
from pathlib import Path
import stat
import ecosystem_contract

ALIAS = Path('/usr/local/libexec/re7/pm2-input.json')
NAMES = {'re7-whatsapp-agent', 're7-whatsapp-web-worker'}
SEALS = fcntl.F_SEAL_WRITE | fcntl.F_SEAL_GROW | fcntl.F_SEAL_SHRINK | fcntl.F_SEAL_SEAL


def require(ok, reason):
    if not ok:
        raise RuntimeError(reason)


def protected_alias():
    # A directory alias, NOT a preparation symlink. PM2 6.0.14 recognizes
    # '.json' in this fixed protected prefix; fd number alone has no suffix.
    for parent in ALIAS.parents:
        s = parent.lstat()
        require(stat.S_ISDIR(s.st_mode) and s.st_uid == 0 and not s.st_mode & 0o022,
                'pm2_input_root_chain')
    s = ALIAS.lstat()
    require(stat.S_ISLNK(s.st_mode) and s.st_uid == 0 and
            os.readlink(ALIAS) == '/proc/self/fd', 'pm2_input_root_alias')


def sealed_fd(raw):
    fd = os.memfd_create('re7-pm2-config', os.MFD_CLOEXEC | os.MFD_ALLOW_SEALING)
    try:
        # Handle short writes without assuming the configuration fits one pipe.
        view = memoryview(raw)
        while view:
            count = os.write(fd, view)
            require(count > 0, 'pm2_input_short_write')
            view = view[count:]
        os.lseek(fd, 0, os.SEEK_SET)
        fcntl.fcntl(fd, fcntl.F_ADD_SEALS, SEALS)
        require(fcntl.fcntl(fd, fcntl.F_GET_SEALS) & SEALS == SEALS, 'pm2_input_unsealed')
        return fd
    except BaseException:
        os.close(fd)
        raise


def start(system, root, name, pm):
    authority = __phase_authority__
    root = Path(root)
    require(name in NAMES, 'pm2_input_name')
    authority.start_mode(root)
    entry = str((root / 'candidate.ecosystem.config.cjs').relative_to(authority.root))
    source = str((root / 'candidate.config.private.json').relative_to(authority.root))
    # The owner-approved DAG must include the JSON and parser alongside the CJS.
    # Context reads/hash-checks the full transitive snapshot through opened FDs.
    raw = authority.snapshot(entry)
    require(source in raw, 'pm2_input_json_dependency_missing')
    parser = str(Path(ecosystem_contract.__file__).relative_to(authority.root))
    require(parser in raw and raw[parser] == __phase_loader__.raw[parser],
            'pm2_input_parser_dependency_missing_or_changed')
    value = ecosystem_contract.source_bytes(raw[source])
    require(raw[entry] == ecosystem_contract.rendered(value), 'ecosystem_json_drift')
    # No require/import is executed from the CJS: canonical literal JSON only.
    # Serialize through the SAME canonical renderer, not an independent parser.
    payload = ecosystem_contract.rendered(value)[len(b'"use strict";\nmodule.exports = '):-2]
    protected_alias()
    fd = sealed_fd(payload)
    try:
        authority.start_mode(root)  # fresh permit/selection/execution, no renew
        system.run([pm, 'start', str(ALIAS / str(fd)), '--only', name], pass_fds=(fd,))
    finally:
        os.close(fd)  # uncertain PM2 response is propagated; never retry/start again

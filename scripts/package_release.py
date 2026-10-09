"""Create a source-only release from an explicit, reviewed allowlist.

No directory recursion and no glob for app content: new modules must be added
here deliberately. Local state, uploaded spreadsheets, environment files and
generated output never enter the archive.
"""
from datetime import datetime, timezone
from pathlib import Path
import argparse
import hashlib
import json
import os
import sys
import tempfile
import zipfile

ROOT = Path(__file__).resolve().parents[1]
REQUIRED = (
    'erp/application/documents.py',
    'erp/modules/identity/application.py',
    'erp/modules/catalog/application.py',
    'src/app/prepare-command.ts',
    'src/shared/application/commands.ts',
    'src/shared/application/command-client.ts',
    'src/shared/presentation/forms.ts',
    'src/modules/cash/forms.ts',
    'src/modules/inventory/forms.ts',
    'src/modules/catalog/forms.ts',
    'src/modules/catalog/application.ts',
    'src/modules/payroll/forms.ts',
    'src/modules/payroll/biometric-reader.ts',
    'tests/feature-clients.test.mjs',

    '.env.example',
    '.gitignore',
    '.python-version',
    'render.yaml',
    'requirements.txt',
    'README.md',
    'iniciar-erp.cmd',
    'server.py',
    'wsgi.py',
    'auth_config.py',
    'storage.py',
    'migrate_data.py',
    'cinema.py',
    'ticketing.py',
    'candy.py',
    'cash.py',
    'thermal.py',
    'payroll.py',
    'payroll_mail.py',
    'cloud_print.py',
    'print_agent.py',
    'admin.html',
    'admin.js',
    'admin.css',
    'design-tokens.css',
    'ui.js',
    'reports.css',
    'pos.css',
    'payroll.css',
    'index.html',
    'app.js',
    'styles.css',
    'trailers.js',
    'assets/logo-multicine-universal.png',
    'assets/README.md',
    'assets/cinema-atmosphere.png',
    'assets/candy-editorial.png',
    'package.json',
    'package-lock.json',
    'tsconfig.json',
    'src/shared/ui.ts',
    'eslint.config.mjs',
    'vitest.config.mjs',
    'docs/FRONTEND.md',
    'tests/ui.test.mjs',
    'tests/e2e.cjs',
    'tests/fixture.py',
    'supabase/schema.sql',
    'docs/DEPLOYMENT.md',
    'docs/PRINTING.md',
    'scripts/package_release.py',
    'scripts/build_frontend.mjs',
    'scripts/check_architecture.py',
    'scripts/check_frontend_architecture.mjs',
    'test_architecture.py',
    'tests/contracts.test.mjs',
    'docs/architecture.md',
    'docs/architecture-current.md',
    'docs/architecture-report.md',
    'docs/adr/001-modular-monolith.md',
    'docs/adr/002-atomic-state-repository.md',
    'erp/__init__.py',
    'erp/application/commands.py',
    'erp/application/ports.py',
    'erp/application/queries.py',
    'erp/application/service.py',
    'erp/application/__init__.py',
    'erp/infrastructure/persistence.py',
    'erp/infrastructure/state_repository.py',
    'erp/infrastructure/__init__.py',
    'erp/modules/__init__.py',
    'erp/presentation/http.py',
    'erp/presentation/__init__.py',
    'erp/shared/__init__.py',
    'erp/shared/domain/records.py',
    'erp/shared/domain/validation.py',
    'erp/shared/domain/__init__.py',
    'erp/modules/candy/domain.py',
    'erp/modules/candy/presentation.py',
    'erp/modules/candy/__init__.py',
    'erp/modules/cash/domain.py',
    'erp/modules/cash/operations.py',
    'erp/modules/cash/presentation.py',
    'erp/modules/cash/__init__.py',
    'erp/modules/catalog/domain.py',
    'erp/modules/catalog/trailers.py',
    'erp/modules/catalog/__init__.py',
    'erp/modules/identity/domain.py',
    'erp/modules/identity/infrastructure.py',
    'erp/modules/identity/__init__.py',
    'erp/modules/inventory/domain.py',
    'erp/modules/inventory/operations.py',
    'erp/modules/inventory/presentation.py',
    'erp/modules/inventory/__init__.py',
    'erp/modules/payroll/application.py',
    'erp/modules/payroll/biometric.py',
    'erp/modules/payroll/domain.py',
    'erp/modules/payroll/mail.py',
    'erp/modules/payroll/presentation.py',
    'erp/modules/payroll/__init__.py',
    'erp/modules/ticketing/admissions.py',
    'erp/modules/ticketing/domain.py',
    'erp/modules/ticketing/presentation.py',
    'erp/modules/ticketing/printing.py',
    'erp/modules/ticketing/print_queue.py',
    'erp/modules/ticketing/thermal.py',
    'erp/modules/ticketing/__init__.py',
    'src/app/admin.js',
    'src/app/public.js',
    'src/app/trailers.js',
    'src/shared/contracts.ts',
    'src/shared/application/http-port.ts',
    'src/modules/candy/application.ts',
    'src/modules/candy/presentation.js',
    'src/modules/cash/presentation.js',
    'src/modules/catalog/presentation.js',
    'src/modules/catalog/public-presentation.js',
    'src/modules/catalog/trailer-player.js',
    'src/modules/identity/application.ts',
    'src/modules/inventory/presentation.js',
    'src/modules/operations/presentation.js',
    'src/modules/payroll/presentation.js',
    'src/modules/ticketing/application.ts',
    'src/modules/ticketing/presentation.js',
)
OPTIONAL = (
    'test_storage.py', 'test_cloud_print.py', 'test_erp.py', 'tests/session.test.mjs',
    'test_payroll_mail_worker.py', 'test_http.py', 'test_auth_config.py',
)
MANIFEST = 'release-manifest.json'


def permitted_file(name):
    if name not in REQUIRED + OPTIONAL:
        raise ValueError(f'Archivo fuera de la lista permitida: {name}')
    path = ROOT / name
    resolved = path.resolve(strict=True)
    if path.is_symlink() or not resolved.is_relative_to(ROOT) or not path.is_file():
        raise ValueError(f'Ruta de archivo no segura: {name}')
    if path.stat().st_size > 20 * 1024 * 1024:
        raise ValueError(f'Archivo inesperadamente grande: {name}')
    return path


def source_files():
    missing = [name for name in REQUIRED if not (ROOT / name).exists()]
    if missing:
        raise ValueError('Faltan archivos requeridos: ' + ', '.join(missing))
    selected = list(REQUIRED) + [name for name in OPTIONAL if (ROOT / name).exists()]
    return [(name, permitted_file(name)) for name in sorted(selected)]


def validate_archive(path, expected):
    with zipfile.ZipFile(path) as archive:
        names = archive.namelist()
        if len(names) != len(set(names)) or set(names) != set(expected) | {MANIFEST}:
            raise ValueError('El ZIP no coincide con la lista permitida.')
        if archive.testzip() is not None:
            raise ValueError('No se pudo verificar la integridad del ZIP.')
        manifest = json.loads(archive.read(MANIFEST))
        if set(manifest['files']) != set(expected):
            raise ValueError('El manifiesto no coincide con el contenido.')
        for name in expected:
            payload = archive.read(name)
            if hashlib.sha256(payload).hexdigest() != manifest['files'][name]['sha256']:
                raise ValueError(f'Huella de archivo incorrecta: {name}')


def package(destination):
    files = source_files()
    destination = destination.resolve()
    output_root = (ROOT / 'output').resolve()
    if not output_root.is_relative_to(ROOT) or not destination.is_relative_to(output_root):
        raise ValueError('El paquete debe guardarse dentro de la carpeta output del proyecto.')
    if destination.suffix.lower() != '.zip':
        raise ValueError('El archivo de salida debe tener extensión .zip.')
    destination.parent.mkdir(parents=True, exist_ok=True)
    manifest = {'formatVersion': 1, 'createdAt': datetime.now(timezone.utc).isoformat(),
                'description': 'Código y documentación; sin datos de operación ni secretos de producción.',
                'files': {}}
    temporary = None
    try:
        fd, name = tempfile.mkstemp(prefix='release-', suffix='.zip.tmp', dir=destination.parent)
        os.close(fd)
        temporary = Path(name)
        with zipfile.ZipFile(temporary, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
            for relative, path in files:
                payload = path.read_bytes()
                manifest['files'][relative] = {'bytes': len(payload), 'sha256': hashlib.sha256(payload).hexdigest()}
                archive.writestr(relative, payload)
            archive.writestr(MANIFEST, json.dumps(manifest, ensure_ascii=False, indent=2))
        validate_archive(temporary, manifest['files'])
        temporary.replace(destination)
        temporary = None
    finally:
        # The temporary path was created in the verified output directory above.
        if temporary is not None:
            temporary.unlink(missing_ok=True)
    digest = hashlib.sha256(destination.read_bytes()).hexdigest()
    checksum = destination.with_suffix('.zip.sha256')
    if checksum.is_symlink() or not checksum.resolve().is_relative_to(output_root):
        raise ValueError('Ruta de huella de archivo no segura.')
    checksum.write_text(f'{digest}  {destination.name}\n', encoding='utf-8')
    return destination, digest, len(files)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', default='output/universal-render-release.zip')
    parser.add_argument('--check', action='store_true', help='Comprobar los archivos permitidos sin crear el ZIP.')
    args = parser.parse_args()
    try:
        if args.check:
            print(f'Lista revisada: {len(source_files())} archivos de código/documentación.')
            return 0
        output, digest, count = package(ROOT / args.output)
        print(f'Paquete preparado: {output}\nArchivos: {count} + manifiesto\nSHA-256: {digest}')
    except (OSError, ValueError, zipfile.BadZipFile) as error:
        print(f'No se creó el paquete: {error}', file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())

# Ubuntu PPA source packages

The desktop app built for Linux is also published through a Launchpad PPA.
`PPA source packages` (`.github/workflows/ppa-source.yml`) packages the same
Electron tree as the Linux desktop job, then writes an unsigned Debian source
package for Ubuntu 22.04 (`jammy`), 24.04 (`noble`), and 26.04 (`resolute`).
A push to `development` builds the source package as workflow artifacts. On a `v*` tag it also attaches those files to the GitHub release.

`scripts/ppa/publish-latest.sh` downloads that release, puts the maintainer
from `.env` into the changelog, signs the source, and runs `dput`. Launchpad
builds the `.deb`. The Forge `.deb` already attached to the release is not the
upload.

Version form is `<upstream>-<revision>~<series><upload>`, for example
`0.5.1-1~jammy1`. Launchpad rejects a repeated version. Set
`PPA_UPLOAD_SUFFIX=2` in `.env` before a second upload of the same upstream
version. There is no `package/deb/` directory; the workflow writes `debian/`
while it builds the source package.

## Credentials

Put these in the repository `.env` file (gitignored).

| Key | Value |
| --- | --- |
| `PPA_GITHUB_REPO` | `<owner>/<name>` |
| `PPA_TARGET` | `ppa:<user>/<archive>` |
| `PPA_DEBFULLNAME` | `<name>` |
| `PPA_DEBEMAIL` | `<email>` |
| `PPA_GPG_KEY_ID` | OpenPGP key id registered on the Launchpad account |
| `GITHUB_TOKEN` | optional, for a private release |
| `PPA_UPLOAD_SUFFIX` | optional |

The signing key stays in the local keyring.

## Local upload

```bash
bash scripts/ppa/publish-latest.sh --dry-run
bash scripts/ppa/publish-latest.sh
```

`--dry-run` only downloads the unsigned source files into `dist/ppa/incoming`.
The upload needs `curl`, `python3`, `dpkg-dev`, `dput`, and a local `gpg` that
can sign with `PPA_GPG_KEY_ID`.

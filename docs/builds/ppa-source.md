# Ubuntu PPA source packages

The desktop app built for Linux is also published through a Launchpad PPA.
`PPA source packages` (`.github/workflows/ppa-source.yml`) packages the same
Electron tree as the Linux desktop job, then writes an unsigned Debian source
package for Ubuntu 22.04 (`jammy`), 24.04 (`noble`), and 26.04 (`resolute`).
A manual `workflow_dispatch` run stores `ppa-source-jammy`, `ppa-source-noble`, and `ppa-source-resolute` as workflow artifacts. Those files are not added to a GitHub release.

`scripts/ppa/publish-latest.sh` uses `gh` to download the artifacts from the latest successful run, or from `--run <run-id>`. It puts the maintainer from `.env` into the changelog, signs the source locally, and runs `dput`. Launchpad builds the `.deb`.

Version form is `<upstream>-<revision>~<series><upload>`, for example
`0.5.1-1~jammy1`. `getnowhere -v` and `getnowhere --version` print the bare
upstream version (`0.5.1`) and exit. Launchpad rejects a repeated version. Set
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
| `PPA_UPLOAD_SUFFIX` | optional |

The signing key stays in the local keyring.

## Local upload

```bash
bash scripts/ppa/publish-latest.sh --dry-run
bash scripts/ppa/publish-latest.sh --dry-run --run <run-id>
bash scripts/ppa/publish-latest.sh
```

`--dry-run` uses `gh` to download the unsigned source files into `dist/ppa/incoming` and stops before signing. The upload also needs `python3`, `dpkg-dev`, `dput`, and a local `gpg` that can sign with `PPA_GPG_KEY_ID`. `gh` must already be logged in.

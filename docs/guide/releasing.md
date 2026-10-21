# Releasing

One tag releases a version on npm and GitHub together, so the two never drift apart; a maintainer
approves the npm version before it goes live.

1. In `packages/webtween/package.json`, set the new version.
2. In `CHANGELOG.md`, rename `## [Unreleased]` to `## [x.y.z] - YYYY-MM-DD`, open a fresh empty
   `## [Unreleased]` above it, and add the version's link (its GitHub Release) at the bottom.
3. Commit, then tag and push: `git tag -a vx.y.z -m "webtween x.y.z"` and
   `git push origin main vx.y.z`.

The release workflow (`.github/workflows/release.yml`) then:

- builds the model from its pinned sources and runs the export's tests (`.github/workflows/model.yml`);
- checks that the tag matches the package's version and that the changelog has its section;
- runs every check and test;
- builds `dist/` and puts the model in `models/`, checked against its manifest by `tools/pack`;
- stages the package on npm with provenance (npm trusted publishing, no token);
- creates the GitHub Release from the changelog section.

4. Approve the staged version: on npmjs.com, the package's **Staged Packages** tab, or
   `npm stage list` and `npm stage approve <id>` in a terminal. Approval asks for two-factor
   authentication, which CI cannot give, so no version goes live without a maintainer.

Provenance links the npm version to the commit and workflow that built it. npm signs it only for a
public GitHub repository, so the repository is made public before the first release (or the
`--provenance` flag is dropped while it stays private).

The workflow is safe to re-run: a version already on npm is not staged again, and an existing
Release is left as it is. A tag is not a release until the GitHub Release exists and the npm
version is approved.

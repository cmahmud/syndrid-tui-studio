# Windows desktop build and GitHub Releases

Syndrid TUI Studio is packaged as a Tauri 2 desktop application. The web/Vite development mode remains available, but the supported Windows distribution format is an NSIS `-setup.exe` installer.

## Local development

Tauri's Windows prerequisites are:

- Node.js/npm
- Rust stable via rustup
- Microsoft C++ Build Tools with **Desktop development with C++**
- WebView2 Runtime (already included with normal Windows 11 installations)

From the repository root:

```powershell
npm ci
npm run desktop:info
npm run desktop:dev
```

## Build the Windows installer locally

```powershell
npm ci
npm run verify:syndrid
npm test
npm run desktop:build
```

The NSIS installer is emitted below `src-tauri\target\release\bundle\nsis\`.

Do not commit generated executables or the `src-tauri/target` directory.

## Publish through GitHub Actions

The workflow `.github/workflows/release-windows.yml` runs on version tags matching `v*`. GitHub's Windows runner builds the Tauri application and attaches the NSIS installer directly to a GitHub Release.

The version comes from the root `package.json`; `src-tauri/tauri.conf.json` points to that file. Keep the Git tag and package version aligned.

Example release:

```powershell
npm version 0.5.0 --no-git-tag-version
git add package.json package-lock.json
git commit -m "release: v0.5.0"
git tag v0.5.0
git push origin main
git push origin v0.5.0
```

After the tag is pushed, open the repository's **Actions** page and watch **Release Windows Desktop App**. When it completes, the repository's **Releases** page will contain the `Syndrid-TUI-Studio_...-setup.exe` installer.

## Signing

The first releases are intentionally unsigned. Windows may display a reputation/SmartScreen warning for a newly distributed unsigned application. A future production distribution can add Windows code signing without changing the application's Tauri architecture.

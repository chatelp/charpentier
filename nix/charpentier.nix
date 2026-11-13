# The app for the X250 (docs/PLAN.md phase 5.8): built from the repository with
# its pnpm lockfile (dependencies pinned by hash), run by nixpkgs' Electron.
# The app ships no native module, so any recent Electron runs its bundle.
{
  lib,
  stdenv,
  nodejs_22,
  # pnpm 10, as the lockfile; nixpkgs' plain pnpm_10 is marked insecure.
  pnpm_10_latest,
  fetchPnpmDeps,
  pnpmConfigHook,
  electron,
  makeWrapper,
  makeDesktopItem,
  copyDesktopItems,
}:
let
  root = ../.;
  # The sources the build reads: no docs, no builds, no node_modules.
  src = lib.cleanSourceWith {
    src = lib.cleanSource root;
    filter =
      path: type:
      let
        rel = lib.removePrefix (toString root + "/") (toString path);
        base = baseNameOf path;
      in
      !(lib.elem base [
        "node_modules"
        "dist"
        "out"
        "result"
        ".turbo"
      ])
      && !(lib.hasPrefix "docs" rel)
      && !(lib.hasPrefix "infra" rel)
      && !(lib.hasPrefix "nix" rel);
  };
  pkg = lib.importJSON ../apps/desktop/package.json;
in
stdenv.mkDerivation (finalAttrs: {
  pname = "charpentier";
  inherit (pkg) version;
  inherit src;

  pnpmDeps = fetchPnpmDeps {
    inherit (finalAttrs) pname version src;
    pnpm = pnpm_10_latest;
    pnpmWorkspaces = [ "@charpentier/desktop..." ];
    fetcherVersion = 5;
    # Refreshed by `scripts/nix-remote.sh build .#charpentier` when the lockfile changes.
    hash = "sha256-+oa2fp45rsRrWPIOgctUO8GKgQvOhk4gA2nv8BllJjs=";
  };

  nativeBuildInputs = [
    nodejs_22
    pnpm_10_latest
    pnpmConfigHook
    makeWrapper
    copyDesktopItems
  ];

  pnpmWorkspaces = [ "@charpentier/desktop..." ];

  env = {
    ELECTRON_SKIP_BINARY_DOWNLOAD = "1";
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD = "1";
  };

  buildPhase = ''
    runHook preBuild
    pnpm --filter @charpentier/desktop exec electron-vite build
    runHook postBuild
  '';

  # Laid out like the development folder: Electron finds the bundle through
  # package.json, the dictionaries under resources/.
  installPhase = ''
    runHook preInstall
    app=$out/share/charpentier
    mkdir -p $app/resources $out/share/icons/hicolor/512x512/apps
    cp apps/desktop/package.json $app/
    cp -r apps/desktop/out $app/out
    cp -r apps/desktop/resources/dictionaries $app/resources/
    cp apps/desktop/resources/icon.png $out/share/icons/hicolor/512x512/apps/charpentier.png
    makeWrapper ${lib.getExe electron} $out/bin/charpentier \
      --add-flags $app \
      --add-flags "\''${NIXOS_OZONE_WL:+\''${WAYLAND_DISPLAY:+--ozone-platform=wayland --enable-wayland-ime}}" \
      --set ELECTRON_IS_DEV 0
    runHook postInstall
  '';

  desktopItems = [
    (makeDesktopItem {
      name = "charpentier";
      exec = "charpentier %U";
      icon = "charpentier";
      desktopName = "Charpentier";
      comment = "Écrire un roman avec un mentor";
      categories = [ "Office" ];
    })
  ];

  meta = {
    description = "Écrire un roman avec un mentor";
    mainProgram = "charpentier";
    platforms = [ "x86_64-linux" ];
  };
})

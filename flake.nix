{
  # The app's Nix package (docs/PLAN.md phase 5.8), for the X250's system: that
  # system and its install key live in their own repository,
  # github:chatelp/charpentier-os, which takes this flake (main, as pushed) as
  # an input and builds it.
  description = "Charpentier : le paquet Nix de l'app";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-26.05";

  outputs =
    { self, nixpkgs, ... }:
    let
      system = "x86_64-linux";
      pkgs = nixpkgs.legacyPackages.${system};
    in
    {
      packages.${system} = {
        # The app, built once whatever the commit (a documentation commit does not rebuild it).
        charpentier-unwrapped = pkgs.callPackage ./nix/charpentier.nix { };
        # The app with the commit it comes from, shown beside its version (« 0.1.1 (43d2f0a) »;
        # a modified checkout « 43d2f0a+ »; a path: input has neither, and shows none): a
        # wrapper sets it at launch, around the same build.
        charpentier =
          let
            unwrapped = self.packages.${system}.charpentier-unwrapped;
          in
          pkgs.symlinkJoin {
            name = "charpentier-${unwrapped.version}";
            inherit (unwrapped) version meta;
            paths = [ unwrapped ];
            nativeBuildInputs = [ pkgs.makeWrapper ];
            postBuild = ''
              rm $out/bin/charpentier
              makeWrapper ${unwrapped}/bin/charpentier $out/bin/charpentier \
                --set CHARPENTIER_COMMIT "${self.shortRev or self.dirtyShortRev or ""}"
            '';
          };
        default = self.packages.${system}.charpentier;
      };
    };
}

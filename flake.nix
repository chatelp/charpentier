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
        # The commit shown beside the version (a dirty checkout gives its own, or nothing).
        charpentier = pkgs.callPackage ./nix/charpentier.nix {
          commit = self.shortRev or self.dirtyShortRev or "";
        };
        default = self.packages.${system}.charpentier;
      };
    };
}

{
  # The app's Nix package (docs/PLAN.md phase 5.8), for the X250's system: that
  # system and its install key live in their own repository, charpentier-os,
  # which takes this flake as an input and builds it (its scripts/nix.sh: the
  # Mac has no Nix).
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
        charpentier = pkgs.callPackage ./nix/charpentier.nix { };
        default = self.packages.${system}.charpentier;
      };
    };
}

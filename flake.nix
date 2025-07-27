{
  description = "Chaotic Next ❄️";

  inputs = {
    devshell = {
      url = "github:numtide/devshell";
      flake = false;
    };
    flake-parts.url = "github:hercules-ci/flake-parts";
    nixpkgs.url = "github:nixos/nixpkgs/nixpkgs-unstable";
    pre-commit-hooks = {
      url = "github:cachix/pre-commit-hooks.nix";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs = {
    flake-parts,
    nixpkgs,
    pre-commit-hooks,
    self,
    ...
  } @ inp: let
    inputs = inp;
    perSystem = {
      pkgs,
      system,
      ...
    }: {
      apps.default = self.outputs.devShells.${system}.default.flakeApp;
      checks.pre-commit-check = pre-commit-hooks.lib.${system}.run {
        hooks = {
          actionlint.enable = true;
          alejandra-quiet = {
            description = "Run Alejandra in quiet mode";
            enable = true;
            entry = ''
              ${pkgs.alejandra}/bin/alejandra --quiet
            '';
            files = "\\.nix$";
            name = "alejandra";
          };
          commitizen.enable = true;
          eslint = {
            enable = true;
            settings.extensions = "\\.(ts|js|mjs|html)$";
          };
          flake-checker.enable = true;
          hadolint.enable = true;
          prettier.enable = true;
          shellcheck.enable = true;
          shfmt.enable = true;
          yamllint.enable = true;
        };
        src = ./.;
      };

      # Handy devshell for working with this flake
      devShells = let
        # Import the devshell module as module rather than a flake input
        makeDevshell = import "${inp.devshell}/modules" pkgs;
        mkShell = config:
          (makeDevshell {
            configuration = {
              inherit config;
              imports = [];
            };
          })
          .shell;
      in rec {
        default = chaotic-next;
        chaotic-next = mkShell {
          commands = [
            {package = "corepack_latest";}
            {package = "nodejs_latest";}
            {package = "pre-commit";}
          ];
          devshell = {
            name = "chaotic-next";
            startup.preCommitHooks.text = ''
              ${self.checks.${system}.pre-commit-check.shellHook}

              if [ ! -d node_modules ]; then
                corepack pnpm install
              else
                outcome=$(corepack pnpm install)
                if  [[ !  "$outcome" =~ "Already up to date" ]]; then
                  echo "Dependencies have been updated"
                fi
              fi
            '';
          };
          env = [
            {
              name = "NIX_PATH";
              value = "${nixpkgs}";
            }
          ];
        };
      };

      # By default, alejandra is WAY to verbose
      formatter = pkgs.writeShellScriptBin "alejandra" ''
        exec ${pkgs.alejandra}/bin/alejandra --quiet "$@"
      '';
    };
  in
    flake-parts.lib.mkFlake {inherit inputs;} {
      imports = [
        inputs.pre-commit-hooks.flakeModule
      ];
      systems = ["x86_64-linux" "aarch64-linux" "x86_64-darwin" "aarch64-darwin"];
      inherit perSystem;
    };
}

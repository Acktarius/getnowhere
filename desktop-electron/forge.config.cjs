/**
 * Electron Forge: Linux package with sidecar + Node + embedded Vite UI.
 * @see docs/builds/github-pages-and-desktop.md
 */

const path = require("node:path");

const iconPng = path.join(__dirname, "icons", "icon.png");

/** @type {import('@electron-forge/shared-types').ForgeConfig} */
module.exports = {
  packagerConfig: {
    name: "GetNowHere",
    executableName: "getnowhere",
    icon: iconPng,
    asar: true,
    extraResource: [
      path.join(__dirname, "resources", "sidecar"),
      path.join(__dirname, "resources", "runtime"),
      path.join(__dirname, "resources", "ui"),
    ],
    ignore: (file) => {
      if (file === "/out" || file.startsWith("/out/")) return true;
      if (file === "/resources" || file.startsWith("/resources/")) return true;
      if (file === "/scripts" || file.startsWith("/scripts/")) return true;
      if (file === "/forge.config.cjs") return true;
      return false;
    },
  },
  rebuildConfig: {},
  makers: [
    {
      name: "@electron-forge/maker-zip",
      platforms: ["linux"],
    },
    {
      name: "@electron-forge/maker-deb",
      platforms: ["linux"],
      config: {
        options: {
          name: "getnowhere",
          productName: "Get Now Here",
          bin: "getnowhere",
          icon: iconPng,
          maintainer: "Acktarius",
          homepage: "https://github.com/acktarius/getnowhere",
          description:
            "Get Now Here desktop shell (Electron + local Hyperswarm sidecar; embedded UI)",
        },
      },
    },
  ],
};

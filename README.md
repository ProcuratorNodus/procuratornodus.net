# Procurator Nodus

Procurator Nodus (PN) is a self-hosted substrate that runs many applications on one server from a single core. It gives them identity and sign-in, data across several databases (including one query language, NodusQL, and federated reads across stores and HTTP APIs), secrets, APIs with keys and MCP access, serving with HTTPS, app starters, TypeScript and Python SDKs with live updates, sealed backups, stable error codes with a one-command lookup, and an admin console, while keeping every application isolated from the others. Hammer, a separate overwatch process, keeps watch on the whole instance. One install can host several independent app groups, and the release includes a complete example stack (a fictional grocery and logistics company) declared as two groups.

**Status:** pre-release, in active development.

**License:** PN will be released as free, open-source software under the Apache-2.0 license. This repository holds only the pre-release landing page, also under Apache-2.0.

**This site** is the project’s official home at https://procuratornodus.com, currently a pre-release preview. The release, documentation and install steps will be published there.

Static files only: `index.html`, `styles.css`, `main.js`, `favicon.svg`, `404.html`. No build step, no frameworks, no analytics, no third-party requests: the two typefaces (Bricolage Grotesque and Cinzel, SIL Open Font License 1.1) are served from `fonts/`. The hero knot is drawn on a 2D canvas in vanilla JavaScript and falls back to an inline SVG without JavaScript; with reduced motion it renders one still frame.

Project: https://github.com/ProcuratorNodus

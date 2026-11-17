# Procurator Nodus

Procurator Nodus (PN) is a self-hosted substrate that runs many applications on one server from a single core. It gives them identity and sign-in, data across several databases (a model API, declared raw queries, and federated reads across stores and HTTP APIs), files, mail, scheduled jobs, secrets, APIs with keys, serving with HTTPS, app starters, TypeScript and Python SDKs, updates that restore the working release if a new one fails, sealed backups, stable error codes with a one-command lookup, and an admin console, while keeping every application isolated from the others. Hammer, a separate overwatch process, keeps watch on the whole instance. One install can host several independent app groups. The site lists what the first release includes and, separately, what comes after it.

**Status:** pre-release, in active development.

**License:** PN will be released as free, open-source software under the Apache-2.0 license. This repository holds only the pre-release landing page, also under Apache-2.0.

**This site** is the project’s official home at https://procuratornodus.com, currently a pre-release preview. The release, documentation and install steps will be published there. At release the site will also host a live demo of the Imaginary Grocery Company reference stack, with test logins; publishing the stack's source as its own public repository comes after the first release.

Static files only: `index.html`, `styles.css`, `main.js`, `cosmos.js`, `favicon.svg`, `404.html`. No build step, no frameworks, no analytics, no third-party requests: the two typefaces (Bricolage Grotesque and Cinzel, SIL Open Font License 1.1) are served from `fonts/`. The hero is a looping particle animation (knot, atoms, planets with a sun, galaxies) drawn with plain WebGL in vanilla JavaScript (`cosmos.js`); without JavaScript or WebGL, or with reduced motion, it shows one still frame as an inline SVG.

Project: https://github.com/ProcuratorNodus

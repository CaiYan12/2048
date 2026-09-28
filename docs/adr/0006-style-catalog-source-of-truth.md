# Pure style catalog with folder-loaded render packs

**Status: Accepted; implementation pending**

Style identity is persisted in settings, sessions, and records, while renderer configurations import CSS and the browser matrix currently parses the renderer registry to discover styles. To keep identity validation independent of rendering and support the planned style folders, IDs, display names, and display order will live in one pure shared catalog; the renderer will load the matching folder only for catalog entries, leaving unlisted folders dormant. Style render definitions and the two decoration slots remain renderer-owned, `src/game` remains DOM-free, and a catalog entry without its folder or required config must fail acceptance. Persisted style IDs are stable; retirement or remapping requires a migration. This preserves ADR-0002's fixed Board and per-style-folder structure while replacing the manual renderer-registration list with a catalog whitelist.

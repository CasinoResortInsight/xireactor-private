# Private migrations

Proprietary SQL migrations. Numbering namespace: `9xx_*.sql` (e.g.
`900_private_init.sql`) so upstream's sequential migrations (currently up to
`021_*`) can grow without collision.

Run as a **separate pass** after upstream migrations complete.

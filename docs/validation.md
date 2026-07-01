## Comandos de validacion conocidos

Usa los comandos documentados del proyecto cuando existan:

```bash
npm --prefix backend test
npm --prefix backend run test:e2e
npm --prefix backend run test:cov
npm --prefix frontend run lint && npm --prefix backend run lint
npm --prefix frontend run build && npm --prefix backend run build
npm --prefix backend run format
```

No uses `npm test` raiz como verificacion SDD si es placeholder.

---
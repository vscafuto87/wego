# WeGo

```bash
npm install
npm run dev        # sviluppo su http://localhost:5173
npm run build      # build di produzione in dist/
npm run preview    # verifica la PWA sulla build (il service worker NON gira in dev)
```

Deploy su Vercel: collega questo repo GitHub a un nuovo progetto Vercel (framework
preset "Vite", build command `npm run build`, output directory `dist`) e fai deploy.

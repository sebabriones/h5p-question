# H5P.QuestionCFRD 1.1

Base **H5P.Question** 1.5.56 (upstream, `coreApi` 1.28) con parches CFRD portados desde la línea 1.0.

## Identidad H5P

| Campo | Valor |
|-------|-------|
| `machineName` | `H5P.QuestionCFRD` |
| Versión | 1.1.0 |
| Entrada JS | `scripts/question-cfrd.js`, `scripts/button-appearance.js` |
| CSS | `styles/question-cfrd.css` |

## Capa CFRD (desde 1.0)

- Popup de feedback dismissible (`showFeedbackPopup`, `isFeedbackPopupVisible`)
- `resolveOverallFeedback` con lead text, imagen y colores por rango
- Apariencia de botones de acción vía `setActionButtonAppearance` + CSS vars
- Reserva de altura del footer al ocultar botones

## Tema 1.28

Los content types que extienden Question con `{ theme: true }` usan `H5P.Components` para botones y el contenedor `h5p-question-evaluation-container`.

## Sync

```bash
npm run sync:lumi
```

Destino: `nuevas-librerias-h5p/H5P.QuestionCFRD-1.1/`

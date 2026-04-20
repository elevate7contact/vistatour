# VistaTour 🏠

**Plataforma de recorridos virtuales premium para agentes inmobiliarios.**

Convierte fotos normales de una propiedad en un tour virtual interactivo — sin cámaras especiales, sin software profesional, en minutos.

---

## ¿Qué hace?

1. **Sube fotos** — arrastra las fotos de la propiedad (cocina, baños, dormitorios, sala, etc.)
2. **Detección automática** — clasifica cada espacio por tipo de habitación
3. **Tour virtual** — genera un recorrido navegable con hotspots, mini-mapa y características de cada espacio

## Cómo usar

Abre `index.html` directamente en el navegador, o usa el servidor local:

```bash
node server.mjs
# Visita http://localhost:7773
```

## Stack

- HTML5 + CSS3 + JavaScript vanilla (sin frameworks)
- Three.js para vista 360° *(en desarrollo)*
- FileReader API para manejo de imágenes locales

## Estado del proyecto

| Feature | Estado |
|---|---|
| Upload drag & drop | ✅ |
| Detección automática de habitaciones | ✅ |
| Tour navegable con hotspots | ✅ |
| Panel de características por espacio | ✅ |
| Tour automático | ✅ |
| Mini-mapa de la propiedad | ✅ |
| Vista 360° inmersiva (Three.js) | 🔄 En desarrollo |
| Extracción de imágenes por URL | 🔄 En desarrollo |
| Links compartibles con clientes | 🔄 En desarrollo |

## Roadmap

- [ ] Visor 360° con Three.js (drag to look around)
- [ ] Backend para extracción de imágenes desde portales
- [ ] Detección de habitaciones por IA (Google Vision)
- [ ] Analytics de visita por habitación
- [ ] PWA / App móvil

---

*Proyecto iniciado por Juan Millan — Abril 2026*

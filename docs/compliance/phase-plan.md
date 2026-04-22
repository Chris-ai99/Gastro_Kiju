# Compliance und Phasen

## Phase 1: Operativer Kern

- Bestellannahme, Hold, Kuechenversand, Review, Receipt-Flow und Abschluss
- Audit-fähige Architekturgrenzen für Druck und Fiskalität
- Demo-Druck und lokale Statistiken für Produkt- und UX-Validierung

## Phase 2: Deutsche Fiskalschicht

- Zertifizierte TSE-Anbindung
- Vollstaendiger Kassenbeleg nach `§ 146a AO` und `KassenSichV`
- DSFinV-K Export
- Kassenabschluss, Verfahrensdokumentation und Ausfallpfade
- Meldelogik für elektronische Aufzeichnungssysteme

## Technische Konsequenzen

- Druck und Fiskalität bleiben absichtlich von der Kernlogik getrennt
- Produktiv-Go-Live als rechtssichere Kasse erst nach Phase 2

# Projektregeln

- Nicht auf den Proxmox-Server oder andere Server deployen, außer der Nutzer fordert den Deploy ausdrücklich an.
- Sichtbare deutsche UI-Texte, Meldungen, Labels, Hilfetexte und nutzernahe Dokumentation müssen als UTF-8 mit korrekten Umlauten und ß geschrieben werden.
- Keine ae/oe/ue/ss-Platzhalter und keine Mojibake-Zeichen wie `Ã¼`, `Ã¤`, `Ã¶`, `ÃŸ`, `Ãœ`, `Â·` oder ähnliche kaputte Encodings in sichtbarer Kopie verwenden.
- Technische Werte stabil lassen: Routen, IDs, Enum-Werte, API-Keys, Paketnamen und Login-Benutzernamen bleiben unverändert, zum Beispiel der Benutzername `Kueche`.
- Wenn ein technischer Wert sichtbar wird, ein separates sichtbares Label mit korrekter Schreibweise verwenden, zum Beispiel `Küche`.

# SchwarmFeld · System Delta

Expertise-Matrix und Vernetzungsplattform für Netzwerke und Initiativen.

Mitglieder können sich mit ihren Fähigkeiten, Interessen und Kontaktdaten eintragen. Administratoren verwalten Profile und geben sie frei.

**Live-Instanz:** https://schwarm-feld-sd.andreas-artmann.de

**Quellcode:** https://github.com/A-Men-66/schwarmfeld-expertisenmatrix

## Funktionen

- Registrierung und Login mit E-Mail/Passwort
- Profilseite mit Skills, Beschreibung, Ort, Zeitbudget
- Einreichung zur Admin-Freigabe
- Admin-Bereich: Nutzerverwaltung, Skill-Verwaltung, App-Konfiguration
- Optionaler Mail-Versand via Brevo SMTP

## Voraussetzungen

- Node.js 18+
- PostgreSQL-Datenbank

## Installation

```bash
git clone https://github.com/A-Men-66/schwarmfeld-expertisenmatrix.git
cd schwarmfeld-sd
npm install
cp .env.example .env
# .env ausfüllen (siehe Kommentare in der Datei)
node server.js
```

## Umgebungsvariablen

Alle Konfiguration erfolgt über Umgebungsvariablen. Vorlage: `.env.example`

## Lizenz

GNU Affero General Public License v3.0 — siehe [LICENSE](LICENSE)

Entwickelt von [Andreas Artmann](https://andreas-artmann.de) mit Unterstützung von [Claude Code](https://claude.ai/code).

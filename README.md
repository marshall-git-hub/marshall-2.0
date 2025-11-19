# Marshall App 2.0

Aplikácia pre správu flotily, skladu a prepravy.

## Funkcie

- ✅ Prihlásenie cez email a heslo
- ✅ Prihlásenie cez firemný kód
- ✅ Modul Oleje
- ✅ Dashboard
- ✅ Moduly: Pneu, Flotila, Servis, Cestáky

## GitHub Pages Setup

1. Prejdite do **Settings** vašeho repozitára na GitHub
2. V ľavom menu kliknite na **Pages**
3. V sekcii **Source** vyberte:
   - **Branch**: `main`
   - **Folder**: `/ (root)`
4. Kliknite **Save**
5. Vaša aplikácia bude dostupná na: `https://marshall-git-hub.github.io/marshall-2.0/`

### Dôležité poznámky

- Aplikácia automaticky presmeruje z root URL na prihlasovaciu stránku (`pages/index/index.html`)
- Všetky cesty v aplikácii používajú absolútne cesty začínajúce s `/`
- Ak používate vlastnú doménu, môžete nastaviť **Custom domain** v GitHub Pages settings

## Lokálny vývoj

```bash
# Inštalácia závislostí
npm install

# Spustenie (vyžaduje lokálny server)
# Použite napr. Live Server v VS Code alebo:
npx http-server
```

## Štruktúra projektu

```
├── pages/
│   ├── index/          # Prihlasovacia stránka
│   └── dashboard/      # Hlavné menu
├── modules/
│   ├── oleje/          # Modul pre oleje
│   ├── pnue/           # Modul pre pneumatiky
│   ├── flotila/        # Modul pre flotilu
│   ├── servis/         # Modul pre servis
│   └── cestaky/        # Modul pre cestáky
├── shared/
│   ├── services/       # Zdieľané služby
│   └── ui/             # Zdieľané UI komponenty
└── main/
    └── config/         # Firebase konfigurácia
```

## Bezpečnosť

- `serviceAccountKey.json` je v `.gitignore` a **NIKDY** by nemal byť commitnutý
- Firebase konfigurácia je v `main/config/firebase-config.js`


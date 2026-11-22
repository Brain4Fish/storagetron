# Inventory Web

## Install

```bash
npm install
```

## Run

```
npm run dev
```

The web UI calls the backend through the same-origin `/api` path. In Kubernetes,
route `/api` to the backend service and all other paths to this web service.

For local frontend development, a runtime Next.js route proxies `/api/*` to the
backend. By default it uses `http://localhost:8086`, matching the root
`docker-compose.yml` port mapping. Override it with an API origin that does not
include an `/api` path:

```bash
API_PROXY_TARGET=http://localhost:8080 npm run dev
```

The proxy preserves the `/api` prefix and supports all API methods. The Next.js
photo optimizer uses the same route when fetching `/api/photos/:photo_id/content`.
Kubernetes deployments must set `API_PROXY_TARGET` to an API origin reachable
from the web pod; the Storagetron Helm chart does this automatically with the
release-specific API service name.

`API_PROXY_TARGET` is evaluated when the web server handles a request, so a
configuration change only requires restarting the web container or pod:

```bash
docker compose restart web
```

## Mobile camera scanning

Mobile browsers require a secure context for camera access. The scanner works on
`localhost` during local development, but phones opening the app through a LAN
address such as `http://192.168.x.x:3000` will not show a camera permission
prompt. Serve the web UI over HTTPS for phone scanning.

## Documentation reports

The Documentation page supports existing Russian XLSX/PDF inventories and an
English **Packing list (Word / DOCX)**. Word exports add a recipient name and an
editable English/Russian declaration, group items by package, and retain source item text.
Change the origin/destination fields for your route. Recipient name and both
addresses are required; carrier, shipment date, and order number are optional for Word.
Word files use portrait pages, omit shipment date/order number, indent goods
descriptions, and use the sample’s three-row table: names/addresses, duplicated
headings, then one continuous body with inventory on the left and a blank right
half. Bag groups use three empty lines; the ITEM NO column shows `BAG №X (box name)`.
Item comments have two extra leading spaces, including wrapped lines. Bold totals
share the contents cell. The declaration defaults to English and Russian blocks
separated by `<newpage>` on its own line. `<total_packages>`, `<customs_value>`,
and `<owner_name>` fill in report values automatically. You can edit the full
text, including signing fields; normal newlines are preserved. Clear the
declaration field to omit it. Generated Word files appear in the same report history and
download through the same-origin API.

## Build

```
npm run build
npm run start
```

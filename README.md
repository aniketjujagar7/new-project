# Masale Market

A simple website for selling masale (spices) with **owner-only full access control**.

## Features

- Public product catalog
- Public order placement form
- Owner authentication (`owner` user)
- Owner-only admin panel to:
  - Add/update/delete products
  - View all orders
  - Update order status

## Run locally

```bash
npm start
```

Open <http://localhost:3000>

Default owner login:

- Username: `owner`
- Password: `owner123` (override with `OWNER_PASSWORD` environment variable)

## Notes

- Data is stored in `data.json`
- Login state is maintained through an HTTP-only session cookie

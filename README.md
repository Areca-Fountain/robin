Layer	Pick	Why
Blockchain	Cardano (Preprod testnet)	Required by the hackathon, and testnet is free
Smart contract	Aiken	Covered in the workshops. Use it for an “approved issuers” registry and for revoking letters
Transaction building	MeshJS or Lucid Evolution (TypeScript)	Easiest way to build and sign Cardano transactions from a web app
Chain data	Blockfrost (or Koios)	Free tier is enough for a hackathon
Wallet	CIP-30 wallets (Eternl, Lace)	The company signs each letter with its own wallet, which acts as its digital stamp
Frontend	Next.js + Tailwind + shadcn/ui	Fast to build, and gives you separate company, employee and verifier pages
Backend	Next.js API routes or NestJS	Keep it in one language (TypeScript)
Database	PostgreSQL (Supabase)	Stores companies, employees and letter status. No sensitive data goes on-chain
File storage	IPFS (Pinata) or S3	Holds the PDF, encrypted. Only the hash goes on-chain
PDF and QR	pdf-lib or react-pdf, plus qrcode	Each letter gets a QR code that opens the verification page

# Amazon RDS CA bundle

- AWS Region: `us-east-2` (US East, Ohio)
- Source: `https://truststore.pki.rds.amazonaws.com/us-east-2/us-east-2-bundle.pem`
- Retrieved: 2026-07-15
- SHA-256: `d46e1bdfda05c8e7644e50930806a19b139a222542bf0348082fb59ece2b5fa5`

The bundle contains the RSA 2048, RSA 4096, and ECC 384 RDS root CAs for the region. When updating it, download only from the AWS RDS truststore, verify the PEM parses, update the checksum above, and rerun the PostgreSQL TLS tests.

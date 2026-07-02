import psycopg2
import psycopg2.extensions as ext

DB_NAME = "smart-climbing"

conn = psycopg2.connect("postgresql://postgres:admin123@localhost:5432/postgres")
conn.set_isolation_level(ext.ISOLATION_LEVEL_AUTOCOMMIT)
cur = conn.cursor()
cur.execute("SELECT 1 FROM pg_database WHERE datname = %s", (DB_NAME,))
if cur.fetchone():
    print(f"Database '{DB_NAME}' already exists.")
else:
    cur.execute(f'CREATE DATABASE "{DB_NAME}"')
    print(f"Database '{DB_NAME}' created successfully.")
cur.close()
conn.close()

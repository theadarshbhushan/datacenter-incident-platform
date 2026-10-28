"""python -m app.migrations [status|upgrade]"""
import asyncio
import sys

from app.core.database import close_db, get_database, init_db
from app import migrations


async def main(cmd: str) -> int:
    await init_db(run_migrations=False)
    try:
        if cmd == "upgrade":
            applied = await migrations.upgrade(get_database())
            print("Applied: " + (", ".join(applied) if applied else "nothing (database is up to date)"))
        elif cmd == "status":
            for m in await migrations.status():
                print(f"{'applied ' + str(m['appliedAt']) if m['appliedAt'] else 'PENDING':<36} {m['name']}  {m['description']}")
        else:
            print(__doc__)
            return 2
        return 0
    finally:
        await close_db()


if __name__ == "__main__":
    sys.exit(asyncio.run(main(sys.argv[1] if len(sys.argv) > 1 else "status")))

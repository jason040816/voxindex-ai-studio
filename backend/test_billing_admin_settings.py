"""Saving credit settings returns the committed settings instead of a 500."""

import unittest
from decimal import Decimal

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.api.billing import BillingSettingsUpdate, PackagePriceUpdate, update_admin_settings
from app.models import Base
from app.models.credits import CreditPackage
from app.models.user import User


class BillingAdminSettingsTest(unittest.TestCase):
    def test_save_returns_updated_package(self):
        engine = create_engine("sqlite:///:memory:")
        try:
            Base.metadata.create_all(engine)
            session = sessionmaker(bind=engine)
            with session() as db:
                db.add(CreditPackage(
                    code="starter", name="体验积分包", points=500,
                    currency="SGD", price=Decimal("5.00"), enabled=1, sort_order=0,
                ))
                db.commit()
                req = BillingSettingsUpdate(
                    rates={}, packages=[PackagePriceUpdate(
                        code="starter", currency="SGD", price=Decimal("9.00"),
                        points=500, enabled=True,
                    )],
                )
                result = update_admin_settings(req, admin=User(is_admin=True), db=db)
                self.assertEqual(result["packages"][0]["price"], "9.00")
                self.assertEqual(db.query(CreditPackage).one().price, Decimal("9.00"))
        finally:
            engine.dispose()


if __name__ == "__main__":
    unittest.main()

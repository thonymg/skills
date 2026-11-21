import os
import tempfile
import unittest

from export import to_json
from report import summary


def write_csv(text):
    handle = tempfile.NamedTemporaryFile("w", suffix=".csv", delete=False, newline="")
    handle.write(text)
    handle.close()
    return handle.name


class Reports(unittest.TestCase):
    def setUp(self):
        self.path = write_csv("name,amount\nana,10\nbob,30\n")

    def tearDown(self):
        os.unlink(self.path)

    def test_summary(self):
        self.assertEqual(summary(self.path), "2 sales, mean 20.00, top: bob, ana")

    def test_export(self):
        self.assertEqual(to_json(self.path), '{"count": 2, "mean": 20.0}')


if __name__ == "__main__":
    unittest.main()

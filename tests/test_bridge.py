import importlib.util
import json
import unittest
from pathlib import Path
from unittest.mock import patch

spec=importlib.util.spec_from_file_location('evil_server',Path(__file__).resolve().parents[1]/'backend'/'server.py')
mod=importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

class FakeResponse:
    def __enter__(self):return self
    def __exit__(self,*a):return False

class BridgeTests(unittest.TestCase):
    def test_missing_tools_rejected(self):
        with self.assertRaises(ValueError):mod.choose_tool({'available_tools':[]})
    def test_allowed_choice_passes(self):
        class Response(FakeResponse):
            pass
        with patch.object(mod.urllib.request,'urlopen',return_value=Response()),patch.object(mod.json,'load',return_value={'answers':{'tool':{'choice':'science','confidence':0.8}}}):
            self.assertEqual(mod.choose_tool({'available_tools':['science','force']})['choice'],'science')
    def test_invalid_choice_rejected(self):
        with patch.object(mod.urllib.request,'urlopen',return_value=FakeResponse()),patch.object(mod.json,'load',return_value={'answers':{'tool':{'choice':'magic'}}}):
            with self.assertRaises(ValueError):mod.choose_tool({'available_tools':['science']})

if __name__=='__main__': unittest.main()

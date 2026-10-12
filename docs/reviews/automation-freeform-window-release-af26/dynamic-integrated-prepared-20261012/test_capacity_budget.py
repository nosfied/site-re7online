import unittest
from capacity_budget import budget

class BudgetTests(unittest.TestCase):
    def test_minimum_and_review_reference(self):
        self.assertEqual(budget(3026829863,2219524096,2219417600)['shortfallBytes'],807412263)
        self.assertEqual(budget(3026829863,2219524096,2219470848)['shortfallBytes'],807359015)
        self.assertEqual(budget(100,90,70)['shortfallBytes'],30)
        self.assertEqual(budget(100,70,90)['shortfallBytes'],30)
    def test_projection_is_not_capacity_pass(self):
        v=budget(100,80,70,40)
        self.assertEqual(v['projectedMarginBytes'],10)
        self.assertFalse(v['budgetFitsNow']);self.assertFalse(v['capacityCertified'])
    def test_missing_or_invalid_observation_denies(self):
        for invalid in [None,True,'100',-1]:
            with self.assertRaises(ValueError):budget(100,invalid,90)
        self.assertEqual(budget(100,100,100)['shortfallBytes'],0)

if __name__=='__main__':unittest.main()

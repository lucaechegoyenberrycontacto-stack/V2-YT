import unittest
from conciliar import reconcile
from importar import workout


class ImportTests(unittest.TestCase):
    def setUp(self):
        self.raw={"id":1,"workout_perform_date":"2026-11-23T02:00:00Z","exercises":[
            {"exercise_id":2,"excercise_name":"Bench Press","exercise_type":"weight_reps",
             "sets":[{"id":"s","rir":0,"weight":"80","reps":"5","is_completed":True}]}]}
    def test_normalize(self):
        series=self.raw["exercises"][0]["sets"]
        series.extend([{"duration":"60","is_completed":True},{"weight":"0","reps":"6","is_completed":False}])
        w=workout(self.raw)
        self.assertEqual(w["date"],"2026-11-22")
        s=w["exercises"][0]["sets"]
        self.assertEqual(s[0]["rir"],0)
        self.assertIsNone(s[1]["weight"])
        self.assertEqual((s[1]["duration"],s[2]["weight"],s[2]["completed"]),("60",0,False))
    def test_merge_retry_and_correction(self):
        w=workout(self.raw)
        legacy={**w,"id":"antiguo","source":"manual","notes":"nota"}
        counts,changes,_=reconcile([w],[legacy])
        merged=changes[0][1]
        self.assertEqual((counts["enriquecidas"],merged["id"],merged["notes"]),(1,"antiguo","nota"))
        self.assertEqual(reconcile([w],[merged])[0]["iguales"],1)
        self.raw["exercises"][0]["sets"][0]["weight"]="90"
        revised=reconcile([workout(self.raw)],[merged])[1][0][1]
        self.assertEqual((revised["id"],len(revised["exercises"][0]["sets"])),("antiguo",1))
        self.assertEqual(reconcile([w],[legacy,{**legacy,"id":"otro"}])[0]["revisar"],1)
        self.assertEqual(reconcile([w,{**w,"id":"lyfta-2"}],[])[0]["nuevas"],2)

if __name__=="__main__":
    unittest.main()

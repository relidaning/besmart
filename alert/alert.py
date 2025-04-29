import argparse
import time
import threading
from win10toast import ToastNotifier


class Alert:
  def __init__(self, duration, type='m'):
    self.notifier = ToastNotifier()
    self.duration = duration
    self.type = type
    
  def notify(self):
    if self.type == 'm': self.duration *= 60
    elif self.type == 'h': self.duration *= 3600
    def clicking():
      # time.sleep(self.duration)
      self.notifier.show_toast("Alert", "Time is up!", duration=5, threaded=True)
    threading.Timer(self.duration, clicking).start()
    

parser = argparse.ArgumentParser(description="Setting Alert")
parser.add_argument('type', type=str, help="Setting Alert type（m/h）")
parser.add_argument('duration', type=int, help="Setting Alert duration")
args = parser.parse_args()
duration = args.duration   
type = args.type
a = Alert(duration, type)
a.notify()
print('Clock is ticking...')

import subprocess
import threading
import time
import requests


STREAM_KEY='test?vhost=live2'
SRS_API = f"http://192.168.0.102:1985/api/v1/streams/"

SOURCES = {
    "pc": f"rtmp://192.168.0.102/live2/pc/{STREAM_KEY}",
    "pad": f"rtmp://192.168.0.102/live2/pad/{STREAM_KEY}"
}

print(SOURCES)
MAIN_URL = f"rtmp://192.168.0.102/main/{STREAM_KEY}"
current_source_proc = None
current_source = None

from collections import defaultdict,deque

import json

# 保存最近 30 組 kbps 記錄
history_len =  30
kbps_history = defaultdict(lambda: deque(maxlen=history_len))

from urllib.parse import urljoin

internal_id=""
def get_active_source(samples=5, interval=1):
    try:
        global STREAM_KEY ,internal_id  ,kbps_history
        for _ in range(samples):
            res = requests.get(SRS_API).json()
            
            matches = [s for s in res.get("streams",[]) if s["name"] == STREAM_KEY.split('?')[0] ]
            #print(STREAM_KEY.split('?')[0])
            print(json.dumps(matches,indent=4,sort_keys=True))
            # 從 matches 裡抓所有合法的 device
            valid_devices = {s.get("app", "").split("/")[-1] for s in matches}
            # 找出要刪除的 key
            to_delete = [k for k in kbps_history.keys() if k not in valid_devices]

            # 一個個刪掉
            for k in to_delete:
                del kbps_history[k]
                print('已無推流設備:',k)

            for s in matches:
                name = s.get("name")
                if name == STREAM_KEY.split('?')[0]:
                    internal_id = s["id"]  # 這個才是 internal ID
        
                app = s.get("app")
                kbps_recv = s.get("kbps", {}).get("recv_30s", 0)
                active_flag = s.get("publish", {}).get("active", False)
                device = app.split("/")[-1]
                if device == "main":
                    continue  # 不把 main 計算進活躍度
                print('check',internal_id,app,device,kbps_recv,active_flag)
                
                if(active_flag==False):
                    kbps_history[device].append(0)
                
                if "live2" in app.split('/')[0] and any(key in device for key in SOURCES.keys()) and active_flag:
                    #print(kbps_history)
                    kbps_history[device].append(kbps_recv)
            time.sleep(interval)

        # 計算平均 kbps，選出平均最高
        avg_scores = {k: sum(v)/len(v) for k,v in kbps_history.items() if v}
    #print("avg_scores:", avg_scores)
        if not avg_scores:
            return None
        return max(avg_scores, key=avg_scores.get),avg_scores

    except Exception as e:
        print("API 讀取錯誤:", e)
        return None

def push_source_to_main(source_url):
    """
    子 ffmpeg 拉來源 → 編碼 H.264 + AAC → 直接推到 MAIN_URL
    保留音訊、影像、縮放、黑邊補齊
    """
    cmd = [
        "ffmpeg",
        "-i", source_url,
        "-vf", "scale=1920:1080:force_original_aspect_ratio=decrease,"
               "pad=1920:1080:(ow-iw)/2:(oh-ih)/2,format=yuv420p",
        "-c:v", "h264_nvenc",   # 或 libx264
        "-preset", "fast",
        "-c:a", "aac",
        "-b:a", "128k",
        "-f", "flv",
        MAIN_URL
    ]
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)

    def monitor_stderr():
        for line in iter(proc.stderr.readline, b''):
            text = line.decode(errors='ignore').strip()
            if "Press [q] to stop" in text:
                print(f"✅ {source_url} 推流到 MAIN_URL 開始")
            elif text:
                print(text)

    threading.Thread(target=monitor_stderr, daemon=True).start()
    return proc

if __name__ == "__main__":
    print("監控來源流，主流保持不中斷...")
    while True:
        active,source = get_active_source()
        print('平均值:',source)
        print('Now',current_source,active)
        if active and active != current_source:
            print(f"切換來源到: {active}")
            if current_source_proc:
                current_source_proc.kill()
            time.sleep(1)
            current_source_proc = push_source_to_main(SOURCES[active])
            current_source = active
        time.sleep(3)
# 多平台推流管理平台

## 📖 專案簡介

本平台是一個 多平台推流管理系統，負責將使用者的推流串接到 SRS (Simple Realtime Server)\
並透過中介服務進行多路推流，讓直播內容能同時分發到多個站點。


> [!WARNING]
> 此專案目前仍屬於 **半成品**，功能尚未完整。
>
> - **忘記密碼重設入口**：尚未實作  
> - **購買方案切換**：尚未支援  
> - **各方案功能限制設計**：尚未完成  
>
> 目前僅提供基本登入與部分操作流程
> 
> 後續將逐步補齊上述功能。


## ✨ 功能特色
- 使用者註冊 / 登錄
- 購買推流方案
- 自動生成專屬推流碼
- 使用推流碼推送至中介服務
- 多平台同步推流 (如 Twitch、YouTube、TikTok 等)

## 🛠 使用流程
註冊帳號  
建立使用者帳號並完成登錄。

購買方案  
選擇合適的推流方案，完成付款。

取得推流碼  
系統會生成一組專屬推流碼，綁定使用者帳號。

推流至中介  
使用推流碼將直播內容推送到平台中介服務。

多平台分發  
中介服務會自動將直播內容轉接至用戶配置的多個指定平台。

## ⚙️ 系統組件

本專案由三個主要模組組成：

- **Backend** (node StreamCheck.js)

    負責推流檢查與用戶狀態管理

    驗證使用者是否已購買方案

    控制推流碼的有效性與使用次數

    推流配置管理：\
    儲存並驗證使用者設定的多平台推流目標（例如 Twitch、YouTube、Kick）\
    確保推流時能正確分發

- **Frontend** (node pay.js)

    提供用戶註冊、登錄介面

    支援方案購買與支付流程

    與後端交互以生成推流碼

    用戶配置介面：\
    讓使用者輸入並管理自己要推流的其他平台設定（如 RTMP URL、串流金鑰）\
    並提交到後端保存


- **SRS 對接** (node SRS/API.js)

    與 SRS 本體對接

    驗證推流碼是否合法

    將合法推流請求轉交給 SRS，進行多路推流分發

    **SRS對接配置說明**

    請在你所使用的SRS配置 像 `live.conf` 裡設定

    以下為示例對接說明

    你通常會看到想這樣的內容

    ```conf
    vhost __defaultVhost__ {

        # 低延遲設置
        min_latency     on;

        # HTTP hooks，用於驗證 streamkey 和統計
        http_hooks {
            enabled         on;
            on_connect      http://0.0.0.0:8500/on_connect;
            on_close        http://0.0.0.0:8500/on_close;
            on_publish      http://0.0.0.0:8500/on_publish;
            on_unpublish    http://0.0.0.0:8500/on_unpublish;
        }
        http_remux {
            enabled on;
            mount [vhost]/[app]/[stream].flv;
        }
            
        # 當有流推上來時，觸發 ffmpeg 轉推
        forward {
            enabled on;
            backend http://0.0.0.0:8085/api/v1/forward;
        }

        play {
            gop_cache_max_frames 2500;
        }
    
    }
    ```

    `__defaultVhost__` 代表這是預設主機名 通常指向 `live`

    也就是會推流地址長這樣

    ```rtmp
    rtmp://192.168.0.102/live/推流碼
    ```

    如果你是要設其他子主機 在SRS裡 會像這樣配置


    ```conf

    vhost live3 {

        play {
            gop_cache_max_frames 2500;
        }

    }
    ```

    當你要推流到 這個指定的vhost時

    他是這樣指定的Vhost主機的
    
    ```rtmp
    rtmp://192.168.0.102/live/推流碼?vhost=live3
    ```

    主要對接 由這兩部分控制 HTTP_HOOKS 與 FORWARD
    
    **HTTP_HOOKS** 負責處理推上來流的鑒權處理

    ```conf
    # HTTP hooks，用於驗證 streamkey 和統計
    http_hooks {
        enabled         on;
        on_connect      http://0.0.0.0:8500/on_connect;
        on_close        http://0.0.0.0:8500/on_close;
        on_publish      http://0.0.0.0:8500/on_publish;
        on_unpublish    http://0.0.0.0:8500/on_unpublish;
    }
    ```

    **FORWARD** 負責查詢 用戶配置的其他要推流的直播平台配置

    ```conf
    # 當有流推上來時，觸發 ffmpeg 轉推
    forward {
        enabled on;
        backend http://0.0.0.0:8085/api/v1/forward;
    }
    ```

    FORWARD 部分是由 `SRS/API.js` 部分進行查詢


## ⚙️ ENV 環境配置說明

請以 `Docs/envExample` 為主

修改完把它搬回 本項目根目錄 並重名命為 `.env`

## PayPal 支付方式說明

本專案目前僅支援 PayPal Sandbox 沙盒環境，用於測試與開發。
尚未準備好遷移至 正式環境 (Live)。

### 環境切換

專案中有提供 USE_SANDBOX=true 開關，用來控制是否使用沙盒環境。

但目前此開關僅在部分流程中生效，並非完整支援。

### 現況

僅保留沙盒環境：所有支付流程目前都在 Sandbox 測試環境中執行。

正式環境尚未支援：尚未完成對 Live 環境的整合與測試。

開關功能不完整：USE_SANDBOX 目前只是部分套用，未能完全切換所有支付流程。




## **Postgres SQL** 數據庫配置


目前主要有 5 個表

分別叫 `menu` `platforms_list` `stream` `user_plans` `users`

具體每個表的內容 這之後再做補充說明




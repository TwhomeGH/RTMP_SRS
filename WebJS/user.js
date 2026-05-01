export let _token = localStorage.getItem('token');
export let userInfo=null;

import { API_BASE_URL } from './config.js';


export function getToken() { return _token; }

export function setToken(t) {
     _token = t; 
     localStorage.setItem('token', t);
    }

export function clearToken() {
  _token = null;
  localStorage.removeItem('token');

}

export async function autoLogin(token, onSuccess) {
    try {
        const res = await fetch(`${API_BASE_URL}/me`, {
            headers: { 'Authorization': 'Bearer ' + token }
        });

        const contentType = res.headers.get("content-type");
        let user = null;

        if (contentType && contentType.includes("application/json")) {
            user = await res.json();
        } else {
            const text = await res.text();
            console.error("收到非 JSON 回應：", text);
            throw new Error("Unexpected response format");
        }

        if (res.ok && user) {
            if (onSuccess && typeof onSuccess === 'function') {
                onSuccess(user);
            }
            userInfo = user;
            console.log(userInfo);
        } else {
            localStorage.removeItem('token');
            showToast('Token 過期，需要重新登入');
        }
    } catch (err) {
        console.error('Auto login failed:', err);
        showToast(`自動登入失敗 ${err}`);
        localStorage.removeItem('token');
    }
}



export function showToast(message, type = 'success') {
            const toast = document.getElementById('toast');

            // 先清除舊的背景顏色 class
            toast.classList.remove('bg-green-500', 'bg-red-500', 'bg-yellow-500');

            // 根據 type 加新的 class
            switch (type) {
                case 'success':
                    toast.classList.add('bg-green-500'); break;
                case 'error':
                    toast.classList.add('bg-red-500'); break;
                case 'warning':
                    toast.classList.add('bg-yellow-500'); break;
            }

            toast.innerHTML = message;
            toast.classList.remove('hidden');
            setTimeout(() => toast.classList.add('hidden'), 4000);
        }



export function renderUserInfo() {
    let nav = document.getElementById('navlinks');
    let loghas=document.getElementById('logBTN')
    if(loghas){
        loghas.remove()
    }
    let logbtn = document.createElement('button');
    logbtn.id="logBTN"
    logbtn.innerText = '登出'
    logbtn.className = "bg-red-500 text-white px-3 py-1 rounded hover:bg-red-600"

    // 綁定登出事件
    logbtn.addEventListener('click', () => {
        localStorage.removeItem('token');
        location.reload();
    });

    if (nav) {
    nav.appendChild(logbtn)
    }
}

import crypto from 'crypto';


/**
 * 
 * @param {*} AES_Mode New代表生成新的 Check代表只檢查長度
 * @param {*} AES 
 * @returns 
 */
function GetAES(AES_Mode='New',AES="Test"){

    var RES_AES = ''
    
    if (String(AES_Mode).toLowerCase() === "check"){
        console.log("不生成新 AES 模式 只確認長度")
        RES_AES = AES
    } else {
        RES_AES = crypto.randomBytes(32).toString('hex');
    }

    let RES = {
        "AES": RES_AES,
        "AES_length":RES_AES.length
    }

    return RES
}


function generateStreamKey() {
  return crypto.randomBytes(8).toString('hex'); // 16 位十六進位
}


console.log("New AES",GetAES())
console.log("Test Check AES",GetAES('Check',"TEST33"))


let TEST_STREAM_KEY = generateStreamKey()
console.log("推流碼生成核准測試",TEST_STREAM_KEY,"長度",TEST_STREAM_KEY.length)
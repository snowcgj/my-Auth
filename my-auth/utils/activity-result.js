// 平台适配：系统选择器共用一次监听和互斥，不让备份/选图覆盖彼此回调。
export function createActivityResultLauncher(getAndroid) {
  let activity = null;
  let pending = null;

  function install() {
    if (activity) return activity;
    const candidate = getAndroid().runtimeMainActivity();
    if (!candidate) throw new Error('NATIVE_ACTIVITY_UNAVAILABLE');
    const previous = candidate.onActivityResult;
    candidate.onActivityResult = (requestCode, resultCode, data) => {
      if (!pending || requestCode !== pending.requestCode) {
        if (typeof previous === 'function') previous.call(candidate, requestCode, resultCode, data);
        return;
      }
      const request = pending;
      pending = null;
      request.resolve({ resultCode, data });
    };
    activity = candidate;
    return activity;
  }

  return function launchActivityForResult(intent, requestCode) {
    return new Promise((resolve, reject) => {
      if (pending) { reject(new Error('NATIVE_OPERATION_BUSY')); return; }
      let request;
      try {
        const host = install();
        request = { requestCode, resolve };
        pending = request;
        // 本机已验证的两参数版，结果统一经 onActivityResult 返回。
        host.startActivityForResult(intent, requestCode);
      } catch (error) {
        if (pending === request) pending = null;
        reject(error);
      }
    });
  };
}

export const launchActivityForResult = createActivityResultLauncher(() => {
  if (typeof plus === 'undefined' || !plus.android || plus.os?.name !== 'Android') throw new Error('ANDROID_ONLY');
  return plus.android;
});

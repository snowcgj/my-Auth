// Vue 提交更新与原生/WebView 绘制不是同一步；留一个短任务间隔再开始同步计算。
// 这不是工作线程，也不保证所有设备在计算期间动画持续流畅，需 Android 真机验收。
export async function waitForFeedback(nextTick) {
  await nextTick();
  await new Promise(resolve => setTimeout(resolve, 80));
}

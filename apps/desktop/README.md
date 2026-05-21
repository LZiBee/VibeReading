# desktop 应用

桌面端应用目录。

```text
src/
  main/       Electron 主进程
  preload/    安全桥接层
  renderer/   React 渲染进程
```

主进程负责窗口、菜单、系统能力和安全 IPC。渲染进程负责 UI，不直接访问文件系统、数据库和密钥。


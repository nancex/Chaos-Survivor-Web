# 背景音乐

把自定义音乐文件放在这个文件夹中，支持 `mp3`、`ogg`、`wav`、`m4a`。

然后在 `playlist.json` 的 `tracks` 中添加文件名：

```json
{
  "formats": ["mp3", "ogg", "wav", "m4a"],
  "tracks": [
    "battle-theme.mp3",
    { "name": "Boss Theme", "file": "boss.ogg" }
  ]
}
```

如果 `tracks` 为空，游戏会使用程序化生成的默认背景音乐。

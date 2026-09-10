# Arch Linux 使用说明书

> 面向第一次接触 Arch Linux、希望完成安装并长期稳定使用的读者  
> 资料核对日期：2026-07-28  
> 适用架构：x86_64

---

## 目录

- [1. 阅读前须知](#1-阅读前须知)
- [2. 认识 Arch Linux](#2-认识-arch-linux)
- [3. 安装路线选择](#3-安装路线选择)
- [4. 安装前准备](#4-安装前准备)
- [5. 制作并启动安装介质](#5-制作并启动安装介质)
- [6. 使用 archinstall 快速安装](#6-使用-archinstall-快速安装)
- [7. 手动安装：UEFI、GPT、ext4 与 GRUB](#7-手动安装uefigptext4-与-grub)
- [8. 首次启动后的基础设置](#8-首次启动后的基础设置)
- [9. 图形桌面与常用硬件](#9-图形桌面与常用硬件)
- [10. 中文环境](#10-中文环境)
- [11. pacman 软件包管理](#11-pacman-软件包管理)
- [12. AUR 使用方法与安全边界](#12-aur-使用方法与安全边界)
- [13. systemd 服务与日志](#13-systemd-服务与日志)
- [14. 文件、权限、磁盘与进程](#14-文件权限磁盘与进程)
- [15. 网络与远程访问](#15-网络与远程访问)
- [16. 日常更新与系统维护](#16-日常更新与系统维护)
- [17. 备份与恢复](#17-备份与恢复)
- [18. 安全建议](#18-安全建议)
- [19. 可选高级方案](#19-可选高级方案)
- [20. 常见故障排查](#20-常见故障排查)
- [21. Live USB 救援流程](#21-live-usb-救援流程)
- [22. 常用命令速查表](#22-常用命令速查表)
- [23. 常见术语](#23-常见术语)
- [24. 官方资料索引](#24-官方资料索引)

---

## 1. 阅读前须知

### 1.1 本说明书能做什么

本文提供一条可以从空硬盘开始执行的完整安装主线，并介绍安装后的桌面、中文输入、软件管理、服务管理、维护、备份、安全和救援方法。

主线环境如下：

- x86_64 电脑；
- UEFI 启动；
- GPT 分区表；
- 单块硬盘；
- ext4 根文件系统；
- GRUB 引导程序；
- NetworkManager 网络管理；
- 未启用磁盘加密；
- 安装时暂时关闭 Secure Boot。

如果你的环境与此不同，请先阅读[安装路线选择](#3-安装路线选择)和[可选高级方案](#19-可选高级方案)，不要直接复制主线命令。

### 1.2 命令提示符约定

本文用下面的符号区分执行身份：

```text
$ 普通用户执行
# root 用户执行，或在命令前加 sudo
```

不要把 `$` 或 `#` 一起输入终端。

尖括号表示必须替换的内容，例如：

```text
<用户名>
<主机名>
<目标磁盘>
<根分区>
```

### 1.3 最重要的安全警告

> [!CAUTION]
> 分区、格式化和重装引导程序都可能造成数据丢失。`/dev/sda`、`/dev/nvme0n1` 等名称在不同电脑上含义不同。执行 `cfdisk`、`fdisk`、`mkfs`、`wipefs`、`dd` 或 `cryptsetup luksFormat` 前，必须用 `lsblk` 再次确认设备。

> [!WARNING]
> Arch Linux 是滚动发行版。本文记录的是核对日期时的可靠流程，软件包名称、默认配置和推荐做法可能改变。遇到与本文不一致的情况，以最新英文 ArchWiki 和程序手册为准。

### 1.4 建议的学习方式

1. 先在虚拟机中完整安装一次。
2. 在实体机安装前做好可验证的备份。
3. 每执行一组命令就检查输出，不要一次粘贴整章。
4. 看不懂某条破坏性命令时先停下，不要靠试错继续。
5. 保留 Arch 安装 U 盘，以便系统无法启动时救援。

---

## 2. 认识 Arch Linux

### 2.1 主要特点

Arch Linux 的主要特点包括：

- 滚动更新：持续获得新版本软件，不进行传统的大版本升级；
- 简洁基础系统：默认只安装最小组件，桌面和服务由用户选择；
- `pacman`：速度快、依赖管理清晰的软件包管理器；
- ArchWiki：内容广泛的官方社区文档；
- AUR：由用户维护的构建脚本仓库；
- 高度可定制：适合希望理解和控制系统组成的用户。

### 2.2 适合谁

Arch Linux 较适合：

- 愿意阅读文档并理解命令含义的用户；
- 希望自主选择桌面、服务和软件栈的用户；
- 需要较新内核、驱动或开发工具的用户；
- 能够定期更新、备份并处理配置变更的用户。

如果你需要“安装后几乎不用维护”的系统，或生产环境要求多年冻结软件版本，应同时评估其他发行版。

### 2.3 滚动发行不等于可以随意更新

Arch 的软件仓库按一个整体持续前进，因此：

- 应使用完整更新 `pacman -Syu`；
- 不支持只同步数据库后更新单个软件包；
- 更新前应查看 Arch Linux 首页的重要公告；
- AUR 软件可能需要在依赖库升级后重新构建；
- 长时间未更新的系统应先阅读近期公告，再进行完整更新。

---

## 3. 安装路线选择

### 3.1 路线 A：archinstall

适合：

- 第一次安装；
- 希望快速得到可用系统；
- 使用常见硬件和常规分区；
- 能接受安装器菜单随版本变化。

优点是快速、出错点少；缺点是较难理解底层步骤，特殊分区和复杂双系统仍需要人工判断。

### 3.2 路线 B：手动安装

适合：

- 希望理解 Arch 的组成；
- 需要精确控制分区、挂载和引导；
- 以后希望独立完成系统救援；
- 安装器不能覆盖实际需求。

本文第 7 章给出完整的手动安装主线。

### 3.3 先判断启动模式

在 Arch 安装环境运行：

```bash
ls /sys/firmware/efi/efivars
```

- 能列出内容：当前以 UEFI 模式启动；
- 提示目录不存在：通常是 BIOS/CSM 模式。

如果电脑支持 UEFI，建议回到固件设置，关闭 CSM/Legacy，以 UEFI 模式重新启动安装盘。

### 3.4 特殊场景

以下场景不要直接套用主线：

- Windows 双系统；
- 需要保留现有 EFI 系统分区；
- LUKS 全盘或根分区加密；
- Btrfs 子卷与快照；
- 软件 RAID、LVM、ZFS；
- ARM 设备；
- 32 位 UEFI；
- Secure Boot 必须始终启用；
- 远程服务器且无法物理接触。

---

## 4. 安装前准备

### 4.1 硬件与资源

建议至少准备：

- 64 位 x86 处理器；
- 4 GiB 内存，图形桌面建议 8 GiB 或更多；
- 30 GiB 可用磁盘空间，长期使用建议 60 GiB 或更多；
- 稳定网络；
- 2 GiB 或更大的 U 盘；
- 另一台可以查询 ArchWiki 的设备。

### 4.2 必须完成的备份

至少备份：

- 文档、照片、项目与下载文件；
- 浏览器书签、密码库和双重认证恢复码；
- SSH、GPG 等密钥；
- 软件许可证和恢复密钥；
- Windows BitLocker 恢复密钥；
- 现有磁盘分区布局截图；
- 重要程序的配置目录。

备份完成后，随机打开几个文件验证它们确实可以读取。只“复制过”但没有验证的备份不可靠。

### 4.3 记录硬件信息

在原系统中记录：

- 处理器品牌：Intel 或 AMD；
- 显卡：Intel、AMD 或 NVIDIA；
- 网卡和无线网卡型号；
- 存储设备名称和容量；
- 当前启动模式；
- 是否开启 Secure Boot、BitLocker 或快速启动；
- Windows 是否使用 UEFI/GPT。

### 4.4 Windows 双系统准备

在 Windows 中：

1. 备份重要数据和 BitLocker 恢复密钥。
2. 使用“磁盘管理”压缩卷，得到“未分配空间”。
3. 不要在 Windows 中提前把未分配空间格式化为 Linux 文件系统。
4. 关闭 Windows“快速启动”，避免 NTFS 处于休眠状态。
5. 若调整 EFI、引导或分区会触发 BitLocker，先按微软文档暂停保护。
6. 不要删除已有 EFI 系统分区。

### 4.5 下载前检查

只从 Arch Linux 官方下载页获取镜像和签名：

- <https://archlinux.org/download/>

不要从网盘、论坛附件或不明“优化版”获取安装镜像。

---

## 5. 制作并启动安装介质

### 5.1 验证镜像

官方页面提供 PGP 签名和校验值。至少验证 SHA-256；条件允许时同时验证 PGP 签名。

Windows PowerShell 校验 SHA-256：

```powershell
Get-FileHash -Algorithm SHA256 .\archlinux-版本-x86_64.iso
```

Linux 校验 SHA-256：

```bash
sha256sum archlinux-版本-x86_64.iso
```

把输出与官方页面逐字符比较。

在已有 Arch 系统中验证 PGP 签名：

```bash
pacman-key -v archlinux-版本-x86_64.iso.sig
```

### 5.2 制作启动 U 盘

Windows 可使用 Rufus；Linux 可使用 `dd` 或图形化写盘工具。

> [!CAUTION]
> `dd` 的 `of=` 指向整块 U 盘，不是分区。选错会覆盖其他磁盘。

Linux 示例：

```bash
lsblk
sudo dd bs=4M if=archlinux-版本-x86_64.iso of=/dev/<U盘设备> status=progress oflag=sync
```

再次强调：`/dev/<U盘设备>` 应类似 `/dev/sdb`，不是 `/dev/sdb1`，也绝不能照抄。

### 5.3 固件设置

进入 UEFI/BIOS 设置后：

- 选择从安装 U 盘以 UEFI 模式启动；
- 主线安装可暂时关闭 Secure Boot；
- 优先使用 AHCI，而不是厂商 RAID/RST 模式；
- 双系统改动 RST/AHCI 前，先了解 Windows 的兼容步骤；
- 不必关闭 TPM；
- 不建议为了安装 Linux 随意更改其他未知选项。

### 5.4 进入安装环境后的检查

检查启动模式：

```bash
ls /sys/firmware/efi/efivars
```

查看键盘布局：

```bash
localectl list-keymaps
```

临时设置美式键盘：

```bash
loadkeys us
```

查看网卡：

```bash
ip link
```

有线网络通常插入网线即可。Wi-Fi 使用：

```bash
iwctl
```

进入交互界面后：

```text
device list
station <无线设备名> scan
station <无线设备名> get-networks
station <无线设备名> connect <Wi-Fi名称>
exit
```

验证网络：

```bash
ping -c 4 archlinux.org
```

同步时间：

```bash
timedatectl set-ntp true
timedatectl status
```

---

## 6. 使用 archinstall 快速安装

### 6.1 启动安装器

联网并校准时间后运行：

```bash
archinstall
```

菜单名称可能随版本变化。重点核对：

- 镜像区域；
- 本地化与键盘；
- 目标磁盘；
- 分区方式；
- 文件系统；
- 启动引导程序；
- 内核；
- 主机名；
- root 密码；
- 普通用户及 sudo 权限；
- 网络配置；
- 音频系统；
- 桌面环境和显卡驱动；
- 时区。

### 6.2 磁盘选择原则

> [!CAUTION]
> “使用整个磁盘”会删除所选磁盘上的现有分区。双系统或需要保留数据时，不能选择自动擦除整盘。

首次尝试建议：

- 在虚拟机中选择整盘；
- 文件系统选 ext4；
- 网络选 NetworkManager；
- 音频选 PipeWire；
- 引导程序选 GRUB 或 systemd-boot；
- 创建普通用户并授予 sudo 权限；
- 保存安装配置时不要公开包含密码或磁盘信息的文件。

### 6.3 安装完成后的检查

重启前确认安装器没有报错。重启并拔出 U 盘后，依次检查：

```bash
uname -a
ip address
systemctl --failed
sudo pacman -Syu
```

如果使用 `archinstall` 已成功安装，可以从第 8 章继续阅读。

---

## 7. 手动安装：UEFI、GPT、ext4 与 GRUB

### 7.1 示例分区布局

以下仅是示意：

| 分区 | 建议大小 | 类型 | 挂载点 |
|---|---:|---|---|
| EFI 系统分区 | 1 GiB | FAT32 | `/boot` |
| Swap | 视内存与休眠需求 | Linux swap | 无 |
| 根分区 | 剩余空间 | ext4 | `/` |

示例设备名：

| 磁盘类型 | 整盘 | 第 1 分区 | 第 2 分区 |
|---|---|---|---|
| SATA/SCSI | `/dev/sda` | `/dev/sda1` | `/dev/sda2` |
| NVMe | `/dev/nvme0n1` | `/dev/nvme0n1p1` | `/dev/nvme0n1p2` |
| eMMC | `/dev/mmcblk0` | `/dev/mmcblk0p1` | `/dev/mmcblk0p2` |

后文统一使用占位符：

```text
<目标磁盘>
<EFI分区>
<交换分区>
<根分区>
```

### 7.2 识别磁盘

```bash
lsblk -o NAME,SIZE,TYPE,FSTYPE,MOUNTPOINTS,MODEL
fdisk -l
```

根据容量、型号和现有分区确认目标。U 盘本身也会出现在列表里，不要选错。

### 7.3 建立分区

新硬盘可运行：

```bash
cfdisk /dev/<目标磁盘>
```

在界面中：

1. 新建 GPT 分区表；
2. 创建约 1 GiB 的 EFI System 分区；
3. 可选创建交换分区；
4. 剩余空间创建 Linux filesystem 分区；
5. 仔细检查后选择 Write；
6. 输入 `yes` 确认；
7. 选择 Quit。

> [!CAUTION]
> 双系统应复用现有 EFI 系统分区，不能格式化它。只在 Windows 预留的未分配空间中创建 Linux 分区。

重新查看：

```bash
lsblk -f
```

### 7.4 格式化

仅适用于新建、确认可以清空的分区：

```bash
mkfs.fat -F 32 /dev/<EFI分区>
mkfs.ext4 /dev/<根分区>
```

如果创建了交换分区：

```bash
mkswap /dev/<交换分区>
swapon /dev/<交换分区>
```

双系统复用已有 EFI 分区时，跳过 `mkfs.fat`。

### 7.5 挂载

```bash
mount /dev/<根分区> /mnt
mkdir -p /mnt/boot
mount /dev/<EFI分区> /mnt/boot
```

检查：

```bash
findmnt /mnt
lsblk -f
```

正确结果应显示根分区挂载到 `/mnt`，EFI 分区挂载到 `/mnt/boot`。

### 7.6 选择镜像

安装镜像通常已启用 HTTPS 镜像。先查看：

```bash
sed -n '1,80p' /etc/pacman.d/mirrorlist
```

网络正常时可以直接使用。若确实需要生成镜像列表，可先查看 `reflector --help` 和 ArchWiki 的最新写法，不要盲目选择仅按延迟排序的单个镜像。

### 7.7 安装基础系统

先判断处理器：

```bash
lscpu | grep -E 'Vendor ID|Model name'
```

Intel 处理器使用 `intel-ucode`，AMD 处理器使用 `amd-ucode`。虚拟机中的微码应由宿主机负责，来宾系统通常可不安装。

Intel 示例：

```bash
pacstrap -K /mnt base linux linux-firmware intel-ucode \
  grub efibootmgr networkmanager sudo nano base-devel \
  man-db man-pages texinfo
```

AMD 示例：

```bash
pacstrap -K /mnt base linux linux-firmware amd-ucode \
  grub efibootmgr networkmanager sudo nano base-devel \
  man-db man-pages texinfo
```

可额外安装备用 LTS 内核：

```bash
pacstrap -K /mnt linux-lts linux-lts-headers
```

无线网卡若需要额外固件，应根据硬件型号查询 ArchWiki，不要随机安装多个冲突驱动。

### 7.8 生成 fstab

```bash
genfstab -U /mnt >> /mnt/etc/fstab
cat /mnt/etc/fstab
```

必须检查：

- 根分区是否存在；
- EFI 分区是否挂载到 `/boot`；
- 是否出现重复行；
- Swap 是否正确；
- UUID 是否与 `lsblk -f` 一致。

若生成错误，先编辑 `/mnt/etc/fstab`，不要重复运行并不断追加。

### 7.9 进入新系统

```bash
arch-chroot /mnt
```

从这里开始，命令作用于新安装的系统。

### 7.10 设置时区

中国大陆示例：

```bash
ln -sf /usr/share/zoneinfo/Asia/Shanghai /etc/localtime
hwclock --systohc
```

检查：

```bash
date
```

### 7.11 设置语言

编辑：

```bash
nano /etc/locale.gen
```

取消下面两行前的注释：

```text
en_US.UTF-8 UTF-8
zh_CN.UTF-8 UTF-8
```

生成区域数据：

```bash
locale-gen
```

初次安装建议系统默认使用英文，避免纯文本控制台无法显示中文：

```bash
echo 'LANG=en_US.UTF-8' > /etc/locale.conf
```

图形桌面安装完成后可以再切换中文界面。

设置控制台键盘：

```bash
echo 'KEYMAP=us' > /etc/vconsole.conf
```

### 7.12 设置主机名

主机名建议只使用小写英文字母、数字和连字符：

```bash
echo '<主机名>' > /etc/hostname
```

编辑：

```bash
nano /etc/hosts
```

写入：

```text
127.0.0.1 localhost
::1       localhost
127.0.1.1 <主机名>.localdomain <主机名>
```

### 7.13 设置密码和普通用户

设置 root 密码：

```bash
passwd
```

创建普通用户：

```bash
useradd -m -G wheel -s /bin/bash <用户名>
passwd <用户名>
```

使用安全方式编辑 sudoers：

```bash
EDITOR=nano visudo
```

取消这一行的注释：

```text
%wheel ALL=(ALL:ALL) ALL
```

不要直接用普通编辑器覆盖 `/etc/sudoers`，`visudo` 会检查语法。

### 7.14 启用网络

```bash
systemctl enable NetworkManager.service
```

安装环境中的网络服务不会自动完整继承到新系统，这一步不能遗漏。

### 7.15 安装 GRUB

先确认仍处于 UEFI 模式且 EFI 变量可访问：

```bash
ls /sys/firmware/efi/efivars
findmnt /boot
```

安装：

```bash
grub-install --target=x86_64-efi --efi-directory=/boot --bootloader-id=GRUB
grub-mkconfig -o /boot/grub/grub.cfg
```

检查输出中是否发现 Linux 内核和微码。不要忽略错误。

双系统希望 GRUB 自动发现 Windows 时，可安装：

```bash
pacman -S os-prober
```

然后编辑 `/etc/default/grub`，加入或修改：

```text
GRUB_DISABLE_OS_PROBER=false
```

确保 Windows EFI 分区已挂载，再重新生成配置：

```bash
grub-mkconfig -o /boot/grub/grub.cfg
```

### 7.16 安装完成前检查

```bash
findmnt /
findmnt /boot
cat /etc/fstab
cat /etc/hostname
locale
systemctl is-enabled NetworkManager.service
ls -la /boot
```

必要时检查失败服务需要在首次启动后进行，因为 chroot 中没有完整运行的新系统服务。

### 7.17 退出并重启

```bash
exit
umount -R /mnt
reboot
```

重启时拔掉安装 U 盘。

如果 `umount` 提示 busy，不要强制关机；用下面的命令查找占用：

```bash
fuser -vm /mnt
```

---

## 8. 首次启动后的基础设置

### 8.1 登录并确认网络

用普通用户登录：

```bash
ip address
nmcli device status
ping -c 4 archlinux.org
```

连接 Wi-Fi：

```bash
nmcli device wifi list
nmcli device wifi connect '<Wi-Fi名称>' password '<Wi-Fi密码>'
```

不希望密码出现在 shell 历史中时，使用：

```bash
nmcli --ask device wifi connect '<Wi-Fi名称>'
```

也可以使用文本界面：

```bash
nmtui
```

### 8.2 完整更新

```bash
sudo pacman -Syu
```

更新后检查：

```bash
systemctl --failed
journalctl -p 3 -b
```

日志中不一定每条红色信息都是当前故障，应结合时间、硬件和实际症状判断。

### 8.3 设置时间同步

```bash
timedatectl status
sudo timedatectl set-ntp true
```

### 8.4 安装备选内核

备用内核能提高救援成功率：

```bash
sudo pacman -S linux-lts linux-lts-headers
sudo grub-mkconfig -o /boot/grub/grub.cfg
```

重启后可在 GRUB 高级选项中选择 LTS 内核。

---

## 9. 图形桌面与常用硬件

### 9.1 先识别显卡

```bash
lspci -k | grep -A 3 -E '(VGA|3D)'
```

基础开源图形组件：

```bash
sudo pacman -S mesa
```

AMD 常见 Vulkan 驱动：

```bash
sudo pacman -S vulkan-radeon
```

较新的 Intel 核显常见 Vulkan 驱动：

```bash
sudo pacman -S vulkan-intel
```

NVIDIA 驱动必须根据显卡代际和所用内核选择。先阅读最新的 NVIDIA ArchWiki，不要看到“nvidia”字样就安装所有相关包。使用多个内核时通常需要匹配的内核模块或 DKMS 方案。

### 9.2 KDE Plasma

安装一个易用的基本组合：

```bash
sudo pacman -S plasma-meta sddm konsole dolphin
sudo systemctl enable sddm.service
```

### 9.3 GNOME

```bash
sudo pacman -S gnome gdm
sudo systemctl enable gdm.service
```

### 9.4 Xfce

```bash
sudo pacman -S xorg-server xfce4 xfce4-goodies lightdm lightdm-gtk-greeter
sudo systemctl enable lightdm.service
```

> [!WARNING]
> SDDM、GDM、LightDM 都是显示管理器。通常只启用一个，不要同时启用多个。

安装桌面后重启：

```bash
sudo reboot
```

### 9.5 PipeWire 音频

```bash
sudo pacman -S pipewire pipewire-audio pipewire-alsa pipewire-pulse wireplumber pavucontrol
```

退出桌面会话后重新登录。检查：

```bash
wpctl status
systemctl --user status pipewire wireplumber
```

音量控制：

```bash
pavucontrol
```

### 9.6 蓝牙

```bash
sudo pacman -S bluez bluez-utils
sudo systemctl enable --now bluetooth.service
```

命令行管理：

```bash
bluetoothctl
```

常用交互命令：

```text
power on
agent on
default-agent
scan on
pair <设备MAC>
trust <设备MAC>
connect <设备MAC>
```

### 9.7 打印机

```bash
sudo pacman -S cups
sudo systemctl enable --now cups.service
```

根据打印机型号安装驱动，然后访问：

```text
http://localhost:631/
```

### 9.8 触摸板与亮度

现代 Wayland 桌面通常可自动处理触摸板。查看设备：

```bash
libinput list-devices
```

亮度管理可安装：

```bash
sudo pacman -S brightnessctl
```

不要为了一个触摸板问题同时安装多个相互竞争的旧式 Xorg 输入驱动。

---

## 10. 中文环境

### 10.1 中文字体

```bash
sudo pacman -S noto-fonts noto-fonts-cjk noto-fonts-emoji
```

可选等宽字体：

```bash
sudo pacman -S noto-fonts-cjk ttf-dejavu
```

刷新字体缓存：

```bash
fc-cache -fv
```

### 10.2 Fcitx 5 中文输入法

```bash
sudo pacman -S fcitx5-im fcitx5-chinese-addons
```

然后：

1. 退出并重新登录桌面；
2. 打开 Fcitx 5 配置；
3. 添加“拼音”等输入法；
4. 在桌面环境的“区域与语言”或“输入法”设置中选择 Fcitx 5。

Wayland、X11、Electron 和不同桌面环境的环境变量要求可能不同。如果某个应用不能输入中文，先判断会话类型：

```bash
echo "$XDG_SESSION_TYPE"
```

再按照 Fcitx 5 ArchWiki 的当前桌面环境章节设置，不要同时配置 IBus 和 Fcitx。

### 10.3 中文界面

确认 `/etc/locale.gen` 已启用：

```text
zh_CN.UTF-8 UTF-8
```

重新生成：

```bash
sudo locale-gen
```

若希望整个系统默认中文：

```bash
sudo nano /etc/locale.conf
```

设置：

```text
LANG=zh_CN.UTF-8
```

纯文本 TTY 对中文支持有限，出现方框并不代表 locale 失效。初学者也可以保持系统默认英文，只让桌面和应用使用中文。

---

## 11. pacman 软件包管理

### 11.1 完整更新

```bash
sudo pacman -Syu
```

这是最重要的日常命令。

> [!CAUTION]
> 不要使用 `pacman -Sy <软件包>`。它只同步数据库却不完整升级系统，会制造 Arch 不支持的“部分更新”状态。

### 11.2 安装软件

```bash
sudo pacman -S <软件包>
```

安装软件前顺便完整更新：

```bash
sudo pacman -Syu <软件包>
```

只在尚未安装时安装：

```bash
sudo pacman -S --needed <软件包>
```

### 11.3 搜索与查询

搜索仓库：

```bash
pacman -Ss <关键词>
```

查看仓库软件包信息：

```bash
pacman -Si <软件包>
```

搜索已安装软件：

```bash
pacman -Qs <关键词>
```

查看已安装软件包信息：

```bash
pacman -Qi <软件包>
```

查某个文件属于哪个已安装软件包：

```bash
pacman -Qo /路径/文件
```

查询仓库中哪个软件包提供某个文件：

```bash
sudo pacman -Fy
pacman -F <文件名>
```

列出软件包安装的文件：

```bash
pacman -Ql <软件包>
```

### 11.4 卸载软件

只卸载软件包：

```bash
sudo pacman -R <软件包>
```

卸载软件包及不再需要的依赖：

```bash
sudo pacman -Rs <软件包>
```

连同全局配置一起移除：

```bash
sudo pacman -Rns <软件包>
```

操作前阅读 pacman 列出的删除清单。不要为了“干净”而盲目删除大量依赖。

### 11.5 查看孤立依赖

```bash
pacman -Qdt
```

没有输出表示当前未发现孤立依赖。先逐项判断用途，再决定是否删除。

### 11.6 软件包缓存

查看大小：

```bash
du -sh /var/cache/pacman/pkg
```

安装维护工具：

```bash
sudo pacman -S pacman-contrib
```

保留每个软件包最近 3 个版本：

```bash
sudo paccache -r
```

删除未安装软件包的旧缓存：

```bash
sudo paccache -ruk0
```

不要频繁使用 `pacman -Scc` 清空全部缓存；缓存中的旧包在回退故障软件时很有价值。

### 11.7 配置文件更新

更新软件包时，pacman 可能生成：

```text
.pacnew
.pacsave
```

安装 `pacman-contrib` 后检查：

```bash
sudo pacdiff
```

不要直接用 `.pacnew` 覆盖原文件。应比较差异，合并新的必要选项，同时保留自己的配置。

### 11.8 常见仓库

官方常见仓库包括：

- `core`：系统核心组件；
- `extra`：桌面和大量常用软件；
- `multilib`：x86_64 上的 32 位库，常用于 Steam/Wine。

启用 multilib 时编辑 `/etc/pacman.conf`，取消下面两行注释：

```text
[multilib]
Include = /etc/pacman.d/mirrorlist
```

然后完整更新：

```bash
sudo pacman -Syu
```

---

## 12. AUR 使用方法与安全边界

### 12.1 AUR 是什么

AUR 提供的是用户提交的 `PKGBUILD` 和相关构建文件，不是由 Arch 官方仓库直接提供并完整审核的二进制包。

> [!WARNING]
> AUR 内容可能执行任意构建和安装操作。软件流行、票数多或被 AUR 助手支持，都不等于安全。

### 12.2 使用前准备

```bash
sudo pacman -S --needed base-devel git
```

### 12.3 手动安装 AUR 软件

以下以 `<AUR软件包>` 为占位符：

```bash
git clone https://aur.archlinux.org/<AUR软件包>.git
cd <AUR软件包>
less PKGBUILD
```

还应检查同目录的：

- `.install` 文件；
- 补丁；
- 下载地址；
- 校验值；
- 构建和安装函数；
- 是否出现 `curl | sh`、可疑域名或越权操作。

确认后以普通用户构建：

```bash
makepkg -si
```

> [!CAUTION]
> 不要用 root 或 `sudo makepkg` 构建 AUR 软件。

### 12.4 AUR 助手

`yay`、`paru` 等是第三方 AUR 助手，不属于 pacman，也不受 Arch 官方支持。它们可以提高便利性，但不能替代对 `PKGBUILD` 差异的检查。

更新 AUR 软件前，应查看：

- 上游变更；
- `PKGBUILD` 与上次版本的差异；
- AUR 页面置顶评论；
- 是否需要手动迁移。

### 12.5 AUR 故障原则

当 AUR 软件在系统更新后不能运行：

1. 先完成官方仓库的完整更新；
2. 重新构建该 AUR 软件；
3. 检查 AUR 评论和上游问题；
4. 不要通过伪造旧版 `.so` 软链接来掩盖 ABI 不兼容；
5. 关键系统组件优先使用官方仓库版本。

---

## 13. systemd 服务与日志

### 13.1 服务基本操作

查看状态：

```bash
systemctl status <服务>.service
```

立即启动：

```bash
sudo systemctl start <服务>.service
```

停止：

```bash
sudo systemctl stop <服务>.service
```

设置开机启动：

```bash
sudo systemctl enable <服务>.service
```

立即启动并设置开机启动：

```bash
sudo systemctl enable --now <服务>.service
```

取消开机启动：

```bash
sudo systemctl disable <服务>.service
```

重启：

```bash
sudo systemctl restart <服务>.service
```

重新加载服务自己的配置：

```bash
sudo systemctl reload <服务>.service
```

修改 unit 文件后让 systemd 重新读取：

```bash
sudo systemctl daemon-reload
```

### 13.2 不要混淆 enable 与 start

- `start`：当前立即启动，不保证下次开机启动；
- `enable`：建立开机启动关系，通常不立即启动；
- `enable --now`：两者一起完成。

### 13.3 查看失败服务

```bash
systemctl --failed
```

用户级服务：

```bash
systemctl --user --failed
```

### 13.4 查看日志

本次启动：

```bash
journalctl -b
```

上一次启动：

```bash
journalctl -b -1
```

某个服务：

```bash
journalctl -u <服务>.service -b
```

内核日志：

```bash
journalctl -k -b
```

只看错误级别：

```bash
journalctl -p 3 -b
```

实时跟踪：

```bash
journalctl -f
```

日志分析时应先记录完整错误文本、时间和触发步骤，再修改配置。

---

## 14. 文件、权限、磁盘与进程

### 14.1 Linux 目录速览

| 路径 | 用途 |
|---|---|
| `/` | 根目录 |
| `/home` | 普通用户数据 |
| `/root` | root 用户家目录 |
| `/etc` | 系统配置 |
| `/var` | 日志、缓存、数据库等可变数据 |
| `/usr` | 大部分程序、库和共享资源 |
| `/boot` | 内核、initramfs、引导文件 |
| `/dev` | 设备节点 |
| `/proc` | 进程和内核信息 |
| `/sys` | 内核设备与子系统接口 |
| `/run` | 本次启动的运行时数据 |
| `/tmp` | 临时文件 |
| `/mnt` | 临时挂载点 |

### 14.2 文件查看

```bash
ls -lah
file <文件>
stat <文件>
less <文件>
```

搜索文件名：

```bash
find <目录> -iname '*关键词*'
```

搜索文件内容：

```bash
grep -RIn '<关键词>' <目录>
```

### 14.3 权限

查看：

```bash
ls -l <文件>
```

常见权限数字：

- `7`：读、写、执行；
- `6`：读、写；
- `5`：读、执行；
- `4`：只读。

修改权限：

```bash
chmod 644 <文件>
chmod 755 <目录或脚本>
```

修改所有者：

```bash
sudo chown <用户>:<用户组> <文件>
```

> [!CAUTION]
> 不要对系统目录递归执行 `chmod 777` 或随意 `chown`。这会破坏安全边界，也可能使 pacman 管理的文件失效。

### 14.4 磁盘空间

```bash
df -h
du -sh <目录>
lsblk -f
findmnt
```

查找占用较大的一级目录：

```bash
sudo du -xhd1 /var | sort -h
```

### 14.5 进程

```bash
ps aux
top
pgrep -a <进程名>
```

正常终止：

```bash
kill <PID>
```

只有进程不能正常退出时才考虑：

```bash
kill -KILL <PID>
```

先确认 PID，避免结束错误进程。

---

## 15. 网络与远程访问

### 15.1 NetworkManager 常用命令

```bash
nmcli general status
nmcli device status
nmcli connection show
nmcli radio wifi on
nmcli device wifi list
```

启用或断开连接：

```bash
nmcli connection up '<连接名>'
nmcli connection down '<连接名>'
```

查看 IP、路由和 DNS：

```bash
ip address
ip route
resolvectl status
```

### 15.2 分层排查网络

按顺序检查：

1. 网卡是否存在：`ip link`；
2. 是否获得 IP：`ip address`；
3. 是否有默认路由：`ip route`；
4. 能否访问网关：`ping -c 4 <网关IP>`；
5. 能否访问公网 IP；
6. 域名能否解析：`resolvectl query archlinux.org`；
7. NetworkManager 日志是否报错。

日志：

```bash
journalctl -u NetworkManager.service -b
```

### 15.3 SSH 客户端

```bash
ssh <用户>@<主机>
```

生成密钥：

```bash
ssh-keygen -t ed25519
```

复制公钥：

```bash
ssh-copy-id <用户>@<主机>
```

### 15.4 SSH 服务端

```bash
sudo pacman -S openssh
sudo systemctl enable --now sshd.service
```

确认监听：

```bash
ss -lntp
```

暴露到公网前至少做到：

- 使用密钥认证；
- 禁止 root 远程登录；
- 关闭不需要的密码认证；
- 配置防火墙；
- 保持系统完整更新；
- 先保留一个已登录会话，再测试新配置，避免把自己锁在服务器外。

修改 SSH 配置后先检查：

```bash
sudo sshd -t
```

通过后再重载：

```bash
sudo systemctl reload sshd.service
```

---

## 16. 日常更新与系统维护

### 16.1 推荐更新流程

1. 查看 <https://archlinux.org/news/> 是否有人工操作公告。
2. 确认重要数据已有备份。
3. 确认根分区和 `/boot` 空间充足。
4. 执行完整更新。
5. 阅读 pacman 输出。
6. 处理 `.pacnew`。
7. 更新 AUR 软件并检查构建变化。
8. 检查失败服务和错误日志。
9. 内核、systemd、驱动、微码或关键库更新后择机重启。

命令：

```bash
sudo pacman -Syu
sudo pacdiff
systemctl --failed
journalctl -p 3 -b
```

### 16.2 不建议的操作

- 不运行 `pacman -Sy <软件包>`；
- 不长期忽略内核、glibc、systemd 等核心包；
- 不随意使用 `--overwrite '*'`；
- 不用 `pacman -Rdd` 绕过依赖检查；
- 不删除 pacman 数据库来“修复依赖”；
- 不用软链接伪造缺失的不同版本共享库；
- 不在更新过程中强制断电；
- 不把第三方非官方仓库当作与官方仓库同等可信。

### 16.3 更新后何时需要重启

Linux 不要求每次更新后都重启，但以下更新后通常应安排重启：

- 内核；
- CPU 微码；
- systemd 等核心系统组件；
- NVIDIA 等内核模块；
- 加密、存储或网络底层组件；
- 更新后服务异常且重启服务不足以恢复。

可查看正在运行的内核：

```bash
uname -r
```

### 16.4 定期维护清单

每周或每次更新：

- 查看 Arch 新闻；
- `pacman -Syu`；
- 检查 `.pacnew`；
- 检查失败服务；
- 验证备份任务。

每月：

- 检查磁盘空间；
- 清理过旧软件包缓存；
- 检查孤立依赖；
- 检查监听端口；
- 抽查备份恢复；
- 检查不再使用的 AUR 软件。

---

## 17. 备份与恢复

### 17.1 备份原则

推荐遵循 3-2-1：

- 至少 3 份数据；
- 使用 2 种不同介质；
- 至少 1 份位于异地或离线位置。

至少备份：

- `/home` 中的重要数据；
- 自己修改过的 `/etc` 配置；
- 数据库和应用专用数据；
- 软件包清单；
- 密钥和恢复码；
- 分区、加密和引导恢复信息。

### 17.2 导出软件包清单

显式安装的官方软件包：

```bash
pacman -Qqe > pkglist.txt
```

外部/AUR 软件包：

```bash
pacman -Qqm > foreign-pkglist.txt
```

恢复显式软件包前先审查列表：

```bash
sudo pacman -S --needed - < pkglist.txt
```

AUR 软件不能仅凭列表盲目恢复，应逐一检查来源和构建文件。

### 17.3 rsync 示例

将家目录备份到已挂载的备份盘：

```bash
rsync -aAXHv --info=progress2 \
  --exclude='.cache/' \
  /home/<用户名>/ /mnt/<备份盘>/<用户名>/
```

第一次应先用 `--dry-run` 预演：

```bash
rsync -aAXHvn --delete <源目录>/ <目标目录>/
```

> [!CAUTION]
> `--delete` 会删除目标中源目录不存在的文件。必须确认源和目标方向后才能去掉 `-n`。

### 17.4 备份不等于快照

- 备份应能抵抗磁盘损坏、误删和机器丢失；
- 同一磁盘上的 Btrfs 快照不能抵抗磁盘物理损坏；
- RAID 主要提高可用性，不等于备份；
- 云同步会同步误删或勒索加密，也不自动等于历史备份。

---

## 18. 安全建议

### 18.1 最小权限

- 日常使用普通用户；
- 只在需要时使用 sudo；
- 不以 root 身份运行浏览器、编辑器和 AUR 构建；
- 只启用真正需要的服务；
- 定期检查监听端口。

查看监听端口：

```bash
sudo ss -lpntu
```

### 18.2 基础防火墙

一种入门选择是 UFW：

```bash
sudo pacman -S ufw
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw enable
sudo systemctl enable ufw.service
sudo ufw status verbose
```

需要 SSH 时，在启用防火墙前允许相应端口：

```bash
sudo ufw allow OpenSSH
```

防火墙规则应根据设备角色设计；桌面、服务器、容器主机和路由器不能共用一套盲目复制的规则。

### 18.3 密码和密钥

- 使用长且唯一的密码；
- 使用密码管理器；
- SSH 私钥和密码库应单独备份；
- 对重要账户启用多因素认证；
- 不把私钥、令牌和恢复码提交到 Git；
- 丢失设备风险较高时考虑 LUKS 磁盘加密。

### 18.4 软件来源

可信顺序通常是：

1. Arch 官方仓库；
2. 已检查的 AUR 构建；
3. 上游官方发布；
4. 其他第三方来源。

不要执行来源不明的：

```text
curl ... | sh
wget ... | sudo bash
```

如确实需要，应先下载、阅读、验证签名或校验值，再在最小权限环境中运行。

### 18.5 安全更新

Arch 不把安全更新与普通更新拆开。保持安全更新意味着定期执行完整系统更新，而不是只升级某个看似有漏洞的软件包。

---

## 19. 可选高级方案

### 19.1 systemd-boot

systemd-boot 结构简单，仅适用于 UEFI。若 EFI 系统分区挂载到 `/boot`：

```bash
bootctl install
```

`/boot/loader/loader.conf` 示例：

```text
default arch.conf
timeout 4
console-mode max
editor no
```

查询根分区 UUID：

```bash
blkid /dev/<根分区>
```

`/boot/loader/entries/arch.conf` 示例：

```text
title   Arch Linux
linux   /vmlinuz-linux
initrd  /initramfs-linux.img
options root=UUID=<根分区UUID> rw
```

当前 Arch 的标准 mkinitcpio 通常会把微码合入 initramfs。若你的 initramfs 生成器使用独立微码镜像，必须按 ArchWiki 将微码 `initrd` 放在主 initramfs 之前。

验证配置：

```bash
bootctl
bootctl list
```

更新引导程序：

```bash
sudo bootctl update
```

Secure Boot 下更新后的 EFI 文件还涉及签名，不能直接照搬未签名流程。

### 19.2 BIOS/Legacy 启动

BIOS 模式常使用 GRUB。GPT 磁盘通常还需要一个很小的 BIOS boot 分区。安装命令与 UEFI 不同，例如：

```bash
grub-install --target=i386-pc /dev/<目标磁盘>
grub-mkconfig -o /boot/grub/grub.cfg
```

这里指向整块磁盘，不是分区。由于 BIOS、MBR、GPT 的组合差异较多，执行前应按最新 GRUB ArchWiki 核对分区条件。

### 19.3 Windows 双系统

核心原则：

- Windows 和 Arch 应使用相同启动模式；
- 复用现有 EFI 系统分区，不格式化；
- Linux 只使用提前腾出的未分配空间；
- 保存 BitLocker 恢复密钥；
- 关闭 Windows 快速启动；
- Windows 更新可能改变 UEFI 启动顺序；
- systemd-boot 通常可自动发现同一 ESP 中的 Windows Boot Manager；
- GRUB 可通过 `os-prober` 或手动链式加载 Windows。

双系统安装前最好准备 Windows 恢复介质。

### 19.4 Btrfs

Btrfs 支持：

- 子卷；
- 写时复制；
- 校验；
- 透明压缩；
- 快照；
- 在线维护。

但快照规划、挂载选项、Swap、休眠和引导回滚会增加复杂度。常见子卷可能包括：

```text
@
@home
@snapshots
@var_log
```

采用 Btrfs 前应先决定：

- 哪些数据应进入快照；
- 快照保留策略；
- 是否需要从引导菜单回滚；
- Swap 文件如何创建；
- 是否启用 `compress=zstd`；
- 如何做独立外部备份。

快照仍不能替代备份。

### 19.5 LUKS 磁盘加密

LUKS 可以保护关机状态下的数据，但会改变：

- 分区和格式化步骤；
- initramfs hooks；
- 内核启动参数；
- Swap 和休眠配置；
- 救援流程；
- 密钥管理方式。

在开始前必须备份 LUKS header，并保存恢复密钥。不要把主线中的未加密命令与零散的 LUKS 命令拼接执行。应完整遵循当前的 dm-crypt/Encrypting an entire system ArchWiki。

### 19.6 Secure Boot

Secure Boot 不是简单的“打开一个开关”。通常涉及：

- 自有密钥或 shim；
- 对引导程序和内核/UKI 签名；
- 更新后自动重签；
- 固件密钥注册；
- 恢复路径。

配置错误可能导致系统无法启动。建议先在关闭 Secure Boot 的情况下完成并验证系统，再单独按最新 ArchWiki 配置，同时准备从固件关闭 Secure Boot 的恢复方法。

### 19.7 Swap 与休眠

查看内存和 Swap：

```bash
free -h
swapon --show
```

是否需要 Swap 取决于内存、负载和是否休眠。休眠要求可用 Swap 足以保存内存状态，还需要正确的 resume 配置。加密、Btrfs 和 Swap 文件组合应查阅对应专章。

---

## 20. 常见故障排查

### 20.1 系统无法启动

先判断故障层级：

1. 固件中是否能看到硬盘；
2. 是否存在 GRUB/Linux Boot Manager 启动项；
3. 是否能看到引导菜单；
4. 内核是否开始加载；
5. 是否进入 emergency shell；
6. 是否只是图形桌面失败，但 TTY 可登录。

尝试：

- 在 UEFI 启动菜单选择正确启动项；
- 在 GRUB 选择 LTS 或 fallback initramfs；
- 按 `Ctrl+Alt+F3` 切换 TTY；
- 使用安装 U 盘进入第 21 章的救援流程。

### 20.2 GRUB 没有菜单项

在 chroot 或正常系统中确认 `/boot` 正确挂载：

```bash
findmnt /boot
ls -la /boot
```

然后重新生成：

```bash
sudo grub-mkconfig -o /boot/grub/grub.cfg
```

若 `/boot` 没挂载就更新内核，文件可能被写入根分区下的普通 `/boot` 目录，真正的 EFI 分区仍是旧文件。必须先确认挂载关系再修复。

### 20.3 systemd-boot 不显示 Arch

```bash
bootctl
bootctl list
findmnt /boot
ls -la /boot/loader/entries
```

检查：

- entry 文件扩展名是否为 `.conf`；
- 内核和 initramfs 是否确实位于 ESP；
- 路径是否以 ESP 根目录为基准；
- 根分区 UUID 是否正确；
- 配置是否含有不可见字符或拼写错误。

### 20.4 无法联网

```bash
systemctl status NetworkManager.service
nmcli device status
ip link
ip address
ip route
rfkill list
journalctl -u NetworkManager.service -b
```

无线设备被软阻止时：

```bash
sudo rfkill unblock wifi
```

如果根本没有网卡，检查：

```bash
lspci -k
lsusb
journalctl -k -b
```

然后按准确芯片型号查找固件或驱动。

### 20.5 DNS 失败

如果能 ping 公网 IP，却不能访问域名：

```bash
resolvectl status
resolvectl query archlinux.org
nmcli connection show
```

不要长期通过手工覆盖 `/etc/resolv.conf` 掩盖 NetworkManager 或解析器配置问题。

### 20.6 图形界面黑屏

切换 TTY：

```text
Ctrl+Alt+F3
```

登录后检查：

```bash
systemctl status display-manager.service
journalctl -b -p 3
journalctl -k -b
lspci -k | grep -A 3 -E '(VGA|3D)'
```

临时停止显示管理器：

```bash
sudo systemctl stop display-manager.service
```

重点判断：

- 显卡驱动是否匹配硬件和内核；
- 内核模块是否成功加载；
- Wayland 与专有驱动是否兼容；
- 是否启用了多个显示管理器；
- 最近是否修改过 Xorg 配置；
- 能否从 LTS 内核进入。

### 20.7 没有声音

```bash
wpctl status
pactl info
systemctl --user status pipewire pipewire-pulse wireplumber
journalctl --user -u pipewire -u wireplumber -b
```

检查默认输出设备、静音状态、应用音量和物理接口。不要同时运行互相冲突的多个音频会话管理器。

### 20.8 pacman 数据库被锁

先确认没有 pacman 或 AUR 助手仍在运行：

```bash
pgrep -a pacman
pgrep -a yay
pgrep -a paru
```

只有确认所有包管理进程都已结束，且上次进程异常中止，才可删除锁：

```bash
sudo rm /var/lib/pacman/db.lck
```

不要在另一个 pacman 正常工作时删除锁文件。

### 20.9 签名或密钥错误

先检查时间：

```bash
timedatectl status
```

再确认镜像同步状态和 `archlinux-keyring`。常见恢复方式是先同步并更新 keyring，随后立即完成整个系统更新：

```bash
sudo pacman -Sy archlinux-keyring
sudo pacman -Su
```

不要在执行第一条后停下或只安装其他单个软件包；完整更新必须紧接着完成。

### 20.10 磁盘已满

```bash
df -h
sudo du -xhd1 /var | sort -h
sudo du -xhd1 /home | sort -h
journalctl --disk-usage
du -sh /var/cache/pacman/pkg
```

清理旧包缓存：

```bash
sudo paccache -r
```

限制持久日志大小前，先阅读 `journald.conf` 手册，不要直接删除正在使用的日志目录。

### 20.11 更新后某个软件不能运行

1. 确认是否完成了 `pacman -Syu`；
2. 检查 Arch 新闻；
3. 查看终端中的完整错误；
4. 查软件包日志和服务日志；
5. 处理 `.pacnew`；
6. AUR 软件重新构建；
7. 必要时从缓存临时回退单个包，但要评估依赖和 ABI；
8. 不创建虚假的 `.so` 软链接。

查看 pacman 日志：

```bash
less /var/log/pacman.log
```

### 20.12 忘记密码

使用安装 U 盘挂载根分区并进入 chroot：

```bash
passwd <用户名>
```

如果根分区加密，需先解锁；如果 `/boot` 独立，按救援章节正确挂载。

---

## 21. Live USB 救援流程

### 21.1 启动并联网

使用 Arch 安装 U 盘以与原系统相同的 UEFI/BIOS 模式启动，连接网络后：

```bash
lsblk -f
```

### 21.2 挂载系统

ext4 主线示例：

```bash
mount /dev/<根分区> /mnt
mount --mkdir /dev/<EFI分区> /mnt/boot
```

如果还有独立 `/home`：

```bash
mount --mkdir /dev/<Home分区> /mnt/home
```

检查：

```bash
findmnt /mnt
cat /mnt/etc/fstab
```

Btrfs、LUKS、LVM 和 RAID 必须先按原布局解锁或激活，再使用正确子卷和挂载参数。

### 21.3 进入系统

```bash
arch-chroot /mnt
```

进入后可以：

- 重置密码；
- 重新安装内核；
- 重新生成 initramfs；
- 修复 fstab；
- 重新安装引导程序；
- 启用网络服务；
- 完成中断的系统更新。

### 21.4 重装内核和生成 initramfs

```bash
pacman -S linux linux-firmware
mkinitcpio -P
```

若使用 LTS：

```bash
pacman -S linux-lts
mkinitcpio -P
```

### 21.5 修复 GRUB

UEFI 且 ESP 挂载在 `/boot`：

```bash
grub-install --target=x86_64-efi --efi-directory=/boot --bootloader-id=GRUB
grub-mkconfig -o /boot/grub/grub.cfg
```

### 21.6 修复 systemd-boot

```bash
bootctl install
bootctl list
```

再检查 `/boot/loader/entries/` 和根分区 UUID。

### 21.7 退出

```bash
exit
umount -R /mnt
reboot
```

如果故障涉及磁盘硬件，请优先复制重要数据，不要在疑似故障盘上反复执行修复写入。

---

## 22. 常用命令速查表

### 系统信息

```bash
uname -a
cat /etc/os-release
lscpu
free -h
lsblk -f
df -h
```

### 硬件

```bash
lspci -k
lsusb
rfkill list
journalctl -k -b
```

### 软件包

```bash
sudo pacman -Syu
sudo pacman -S <软件包>
sudo pacman -Rns <软件包>
pacman -Ss <关键词>
pacman -Qi <软件包>
pacman -Qo <文件>
```

### 服务

```bash
systemctl status <服务>
sudo systemctl enable --now <服务>
sudo systemctl restart <服务>
systemctl --failed
```

### 日志

```bash
journalctl -b
journalctl -b -1
journalctl -u <服务> -b
journalctl -p 3 -b
```

### 网络

```bash
ip address
ip route
nmcli device status
resolvectl status
ss -lpntu
```

### 文件与磁盘

```bash
ls -lah
findmnt
du -sh <目录>
find <目录> -iname '*关键词*'
grep -RIn '<关键词>' <目录>
```

### 电源

```bash
systemctl reboot
systemctl poweroff
systemctl suspend
systemctl hibernate
```

执行休眠前必须已经正确配置 Swap 和 resume。

---

## 23. 常见术语

| 术语 | 含义 |
|---|---|
| UEFI | 现代固件接口，接替传统 BIOS |
| ESP | EFI System Partition，保存 EFI 引导文件的 FAT 分区 |
| GPT | 现代磁盘分区表 |
| initramfs | 内核启动早期使用的临时根文件系统 |
| boot loader | 启动内核的引导程序，如 GRUB、systemd-boot |
| kernel | Linux 内核 |
| firmware | 设备运行所需的固件 |
| microcode | CPU 厂商提供的处理器修正 |
| root | 最高权限用户；也可表示根文件系统 `/` |
| chroot | 临时把某目录作为进程所见的根目录 |
| mount | 将文件系统连接到目录树 |
| fstab | `/etc/fstab`，描述开机挂载关系 |
| locale | 语言、地区和字符编码设置 |
| repository | 软件仓库 |
| package | 由包管理器安装的软件单元 |
| dependency | 软件运行或构建所需的其他软件包 |
| AUR | 用户维护的 Arch 构建脚本仓库 |
| PKGBUILD | 描述如何取得源码、构建和打包的脚本 |
| systemd | Arch 默认的系统与服务管理器 |
| unit | systemd 管理的服务、挂载点、定时器等对象 |
| daemon | 后台服务进程 |
| Wayland | 现代图形显示协议 |
| Xorg/X11 | 传统图形显示系统 |
| LUKS | Linux 常用的块设备加密格式 |
| Btrfs | 支持子卷、校验、压缩和快照的文件系统 |
| rolling release | 持续更新而非定期重装大版本的发行模式 |

---

## 24. 官方资料索引

以下链接应作为进一步核对的首选：

- Arch Linux 官网：<https://archlinux.org/>
- 下载页面：<https://archlinux.org/download/>
- 重要新闻：<https://archlinux.org/news/>
- 官方安装指南：<https://wiki.archlinux.org/title/Installation_guide>
- 安装后建议：<https://wiki.archlinux.org/title/General_recommendations>
- pacman：<https://wiki.archlinux.org/title/Pacman>
- 系统维护：<https://wiki.archlinux.org/title/System_maintenance>
- AUR：<https://wiki.archlinux.org/title/Arch_User_Repository>
- 网络配置：<https://wiki.archlinux.org/title/Network_configuration>
- NetworkManager：<https://wiki.archlinux.org/title/NetworkManager>
- GRUB：<https://wiki.archlinux.org/title/GRUB>
- systemd-boot：<https://wiki.archlinux.org/title/Systemd-boot>
- 微码：<https://wiki.archlinux.org/title/Microcode>
- NVIDIA：<https://wiki.archlinux.org/title/NVIDIA>
- AMDGPU：<https://wiki.archlinux.org/title/AMDGPU>
- Intel graphics：<https://wiki.archlinux.org/title/Intel_graphics>
- PipeWire：<https://wiki.archlinux.org/title/PipeWire>
- Fcitx 5：<https://wiki.archlinux.org/title/Fcitx5>
- 安全建议：<https://wiki.archlinux.org/title/Security>
- 防火墙：<https://wiki.archlinux.org/title/Category:Firewalls>
- dm-crypt：<https://wiki.archlinux.org/title/Dm-crypt>
- Btrfs：<https://wiki.archlinux.org/title/Btrfs>
- Secure Boot：<https://wiki.archlinux.org/title/Unified_Extensible_Firmware_Interface/Secure_Boot>
- 系统救援：<https://wiki.archlinux.org/title/Chroot>

在终端中还可以使用：

```bash
man <命令>
<命令> --help
```

示例：

```bash
man pacman
man systemctl
man fstab
man mkinitcpio
```

---

## 结语

使用 Arch Linux 最重要的能力不是记住所有命令，而是：

1. 修改前理解对象和风险；
2. 从日志中保留完整证据；
3. 使用官方文档核对易变步骤；
4. 坚持完整更新，避免部分更新；
5. 对 AUR 和第三方脚本保持审慎；
6. 建立并实际验证备份与救援流程。

只要保留安装介质、可靠备份和清晰的故障记录，大多数 Arch Linux 问题都可以定位和恢复。

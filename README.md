# gulp构建参考配置文件

## 项目初始化
```
npm install
```


## 特点


> 1. 速度快配置性强，按配置发布路径打包成zip发布  
> 2. sass编译提供双模式，极速模式（只编译单文件，不分析依赖）实时刷新浏览器  
> 3. 全面支持css/js/node增量打包，自动缓存上次打包的文件版本  
> 4. 支持样式静态页服务代理到本地node服务，共用ejs模板语法，以实现静态页面模块化  
> 5. html/css/js全监控，静态页自动刷新，添加js文件后自动刷新amd配置   
> 6. 非常友好的task帮助和运行输出  

## 查看支持的任务

```
gulp help
```

任务命名规则为`动作:类型`，例如`compile:sass`表示编译sass。

主要包含以下任务：

**build:js** 构建并打包js  
**build:config** 构建并打包amd配置  
**build:css** 构建并打包css  
**build:node** 构建并打包node  
**build** 构建全部  
**compile:sass** 编译scss文件
**update:config** 更新amd配置  
**check:js** 检查js(可能无用的模块依赖）
**clean** 清理
**default** (默认) 开启本地服务

## 增量编译

执行`build:*`类的任务时，传递-i选项即可，例如：  
```
gulp build -i
```
增量构建所有包。


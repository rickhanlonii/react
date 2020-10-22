# New reconciler tester

## How do I run this fixture?

```shell
# 1: Build react from source
cd /path/to/react
yarn
yarn build react-dom/index,react/index,react-cache,scheduler --type=FB_WWW

# 2: Install fixture dependencies
cd fixtures/new-reconciler
yarn

# 3: Copy build renderers
cp -R ../../build/facebook-www/* ./src/vendor

# 3: Run the app
yarn start
```

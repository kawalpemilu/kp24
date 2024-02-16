# Kawal Pemilu 2024

This project was generated with [Angular CLI](https://github.com/angular/angular-cli) version 17.0.9.

- [Kawal Pemilu 2024](#kawal-pemilu-2024)
  - [Prerequisites](#prerequisites)
  - [Development](#development)
    - [Local Firebase emulator](#local-firebase-emulator)
  - [Default commands](#default-commands)
    - [Development server](#development-server)
    - [Code scaffolding](#code-scaffolding)
    - [Build](#build)
    - [Running unit tests](#running-unit-tests)
    - [Running end-to-end tests](#running-end-to-end-tests)
    - [Further help](#further-help)

## Prerequisites

- [Node.js](https://nodejs.org/en/) version 20.11.0 or higher
- [Angular CLI](https://angular.io/cli) version 17.0.9 or higher
- [Firebase CLI](https://firebase.google.com/docs/cli) version 13.0.3 or higher
- [Java](https://www.java.com/en/) to run Firebase emulator locally

## Development

1. Clone this repository
2. Run `npm install` at the **root** and the **functions** directories to install all dependencies
3. Run `npm run start:prod` to start the Angular development server while pointing to the production Firebase instance.

### Local Firebase emulator

The `npm run start:emulator` command will start the Firebase emulator locally.
However, currently, we can't make the cloud task queue to run locally.
Therefore, for now, we will use the production environment to develop and test.

If we couldn't fix this issue in time, we may need to set up a staging environment for development and testing purposes.

### Local Firebase Emulator (with Docker)

If you didn't have docker, follow [installation process here](https://docs.docker.com/engine/install/)

```
$ docker-compose up -d   # to start firebase emulators
$ docker-compose logs -f # to check logs
$ docker-compose down    # to stop docker services
```

## Default commands

These are the default commands provided when generating this project.
We are keeping theme here as a reference.

### Development server

Run `ng serve` for a dev server. Navigate to `http://localhost:4200/`. The application will automatically reload if you change any of the source files.

### Code scaffolding

Run `ng generate component component-name` to generate a new component. You can also use `ng generate directive|pipe|service|class|guard|interface|enum|module`.

### Build

Run `ng build` to build the project. The build artifacts will be stored in the `dist/` directory.

### Running unit tests

Run `ng test` to execute the unit tests via [Karma](https://karma-runner.github.io).

### Running end-to-end tests

Run `ng e2e` to execute the end-to-end tests via a platform of your choice. To use this command, you need to first add a package that implements end-to-end testing capabilities.

### Further help

To get more help on the Angular CLI use `ng help` or go check out the [Angular CLI Overview and Command Reference](https://angular.io/cli) page.

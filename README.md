# CoCo App scaffold


- `pubspec.yaml` declares the Flutter 3.x SDK dependency.

- `lib/main.dart` provides a Chat screen with a text field, Send button, and local mock replies.

- `lib/api.dart` defines stubs for `POST /api/chat` and `/ws/app`, whose first frame is `app.auth`.

- `README.md` lists the scaffold files and build steps.


From this directory, generate a web runner with Flutter 3.x and build the app.

```sh

flutter create --platforms=web --project-name coco_app .

flutter build web

```

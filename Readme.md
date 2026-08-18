AR TECH



WebAR Platform (10-Day Demo) - Design Summary

1. Aim
Objective
Build a dynamic WebAR demonstration platform where scanning a QR code launches a browser-based AR experience. Instead of hardcoding 3D models into the frontend, the application dynamically retrieves scene metadata and assets from Firebase through a FastAPI backend.
The demo should prove that the platform can:
* Scan a QR code
* Load a WebAR experience
* Fetch scene metadata dynamically
* Display 3D models using Three.js
* Support images and videos
* Support basic interactions (tap, animation)
* Be easily extensible for future features

2. Technology Stack & Flow
Overall Architecture
                        User
                          │
                    Scan QR Code
                          │
                          ▼
                  Browser (WebAR)
                Three.js + WebXR
                          │
                    REST API Calls
                          │
                          ▼
                     FastAPI Backend
                          │
          ┌───────────────┴───────────────┐
          │                               │
          ▼                               ▼
    Cloud Firestore               Firebase Storage
   (Scene Metadata)         (GLB, Images, Videos)

Responsibilities
Frontend (Three.js + WebXR)
Responsible for:
* Opening WebAR
* Calling backend APIs
* Rendering 3D scene
* Loading models
* Playing animations
* Displaying images/videos
* Handling user interactions

FastAPI
Responsible for:
* Scene APIs
* Reading Firestore
* Returning scene metadata
* Generating Storage URLs (if required)
* Keeping Firebase hidden from frontend

Cloud Firestore
Stores:
* Scene information
* Asset metadata
* Interaction configuration
Example:
Scene
 ├── Name
 ├── MarkerId
 ├── Assets[]
 └── Interactions[]

Firebase Storage
Stores:
models/
    car.glb

images/
    logo.png

videos/
    intro.mp4

3. Data Flow
User

↓

Scan QR

↓

Open WebAR Page

↓

Three.js

↓

GET /api/scenes/{markerId}

↓

FastAPI

↓

Cloud Firestore

↓

Return Scene JSON

↓

Three.js

↓

Download Assets from Firebase Storage

↓

Render Scene

↓

User Interaction

↓

Animation / Video / Information Panel

4. Required Endpoints
Scene API
GET /api/scenes/{markerId}
Returns:
{
  "sceneId": 1,
  "name": "Car Demo",
  "assets": [
    {
      "id": 1,
      "type": "glb",
      "url": "...",
      "position": [0,0,0],
      "rotation": [0,180,0],
      "scale": 1
    }
  ]
}

Asset Details (Optional)
GET /api/assets/{assetId}
Useful if asset metadata grows.

Health Check
GET /health
Returns:
Healthy

Future Endpoints (Not Required for Demo)
POST /scene

PUT /scene/{id}

DELETE /scene/{id}

POST /upload

5. Firebase Structure
Cloud Firestore
Scenes

Scene1

    Name
    MarkerId
    Description

    Assets
        Car
        Logo
        Intro Video

Firebase Storage
models/
    car.glb

images/
    logo.png

videos/
    intro.mp4

6. User Sequence Diagram
+---------+       +-----------+      +----------+      +----------------+      +------------------+
|  User   |       | Three.js  |      | FastAPI  |      | Cloud Firestore|      | Firebase Storage |
+---------+       +-----------+      +----------+      +----------------+      +------------------+
     |                   |                  |                    |                        |
     | Scan QR           |                  |                    |                        |
     |------------------>|                  |                    |                        |
     |                   | Open WebAR       |                    |                        |
     |                   |----------------->|                    |                        |
     |                   | GET /scene       |                    |                        |
     |                   |----------------->|                    |                        |
     |                   |                  | Query Scene        |                        |
     |                   |                  |------------------->|                        |
     |                   |                  |<-------------------|                        |
     |                   |<-----------------| Scene JSON         |                        |
     |                   |                  |                    |                        |
     |                   | Download Assets  |                    |----------------------->|
     |                   |--------------------------------------------------------------->|
     |                   |<---------------------------------------------------------------|
     |                   | Render AR Scene |                    |                        |
     |<------------------|                  |                    |                        |
     | Tap Object        |                  |                    |                        |
     |------------------>|                  |                    |                        |
     |                   | Play Animation   |                    |                        |
     |<------------------|                  |                    |                        |

7. Demo Features (10-Day MVP)
* QR code launches a WebAR page.
* FastAPI retrieves scene metadata from Cloud Firestore.
* Three.js loads a GLB model from Firebase Storage.
* Dynamic loading of images and videos.
* Tap interaction on the 3D object.
* Play a predefined animation.
* Display an information panel.
* Modular architecture that can evolve into a full WebAR platform.

Future Enhancements
After the demo, the platform can be expanded with:
* Authentication
* Admin portal for scene management
* Asset upload interface
* Dynamic interaction scripting
* Multiple scenes per marker
* Analytics
* AI-assisted scene generation
* Voice commands
* Multiplayer AR
* Redis caching
* PostgreSQL migration (if more advanced relational queries are needed)
This design keeps the demo focused while establishing an architecture that can grow without major restructuring.

from typing import Literal
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from kubernetes import client, config
from kubernetes.client.rest import ApiException

app = FastAPI(title="Node Affinity Dashboard API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def load_cluster_config():
    try:
        config.load_kube_config()
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Could not load kubeconfig. Check 'kubectl config current-context'. Details: {exc}",
        )

@app.get("/")
def root():
    return {"message": "Node Affinity Dashboard API is running"}

@app.get("/api/health")
def health():
    load_cluster_config()
    try:
        version = client.VersionApi().get_code()
        return {"status": "connected", "kubernetes_version": version.git_version}
    except Exception as exc:
        raise HTTPException(status_code=503, detail=str(exc))

@app.get("/api/nodes")
def get_nodes():
    load_cluster_config()
    try:
        nodes = client.CoreV1Api().list_node().items
        result = []
        for node in nodes:
            labels = node.metadata.labels or {}
            result.append({
                "name": node.metadata.name,
                "status": next(
                    (condition.type for condition in (node.status.conditions or [])
                     if condition.type == "Ready" and condition.status == "True"),
                    "NotReady",
                ),
                "hardware": labels.get("hardware", "not-labeled"),
                "labels": labels,
                "roles": [key.split("/", 1)[1] for key in labels if key.startswith("node-role.kubernetes.io/")],
            })
        return result
    except ApiException as exc:
        raise HTTPException(status_code=exc.status or 500, detail=exc.reason)

@app.get("/api/pods")
def get_pods():
    load_cluster_config()
    try:
        pods = client.CoreV1Api().list_namespaced_pod(namespace="default").items
        return [{
            "name": pod.metadata.name,
            "status": pod.status.phase or "Unknown",
            "node": pod.spec.node_name or "Not scheduled",
            "ip": pod.status.pod_ip or "-",
            "created": pod.metadata.creation_timestamp.isoformat() if pod.metadata.creation_timestamp else None,
            "labels": pod.metadata.labels or {},
        } for pod in pods if (pod.metadata.labels or {}).get("managed-by") == "node-affinity-dashboard"]
    except ApiException as exc:
        raise HTTPException(status_code=exc.status or 500, detail=exc.reason)

class WorkloadRequest(BaseModel):
    hardware: Literal["high-cpu", "high-memory", "standard", "high-gpu"]
    replicas: int = Field(default=2, ge=1, le=10)
    affinity: Literal["required", "preferred"] = "required"
    name: str = Field(default="affinity-demo", pattern=r"^[a-z0-9]([-a-z0-9]*[a-z0-9])?$", max_length=40)

@app.post("/api/workloads")
def create_workload(request: WorkloadRequest):
    load_cluster_config()
    apps = client.AppsV1Api()
    labels = {"app": request.name, "managed-by": "node-affinity-dashboard"}
    expression = client.V1NodeSelectorRequirement(
        key="hardware", operator="In", values=[request.hardware]
    )

    if request.affinity == "required":
        node_affinity = client.V1NodeAffinity(
            required_during_scheduling_ignored_during_execution=client.V1NodeSelector(
                node_selector_terms=[client.V1NodeSelectorTerm(match_expressions=[expression])]
            )
        )
    else:
        node_affinity = client.V1NodeAffinity(
            preferred_during_scheduling_ignored_during_execution=[
                client.V1PreferredSchedulingTerm(weight=100, preference=client.V1NodeSelectorTerm(match_expressions=[expression]))
            ]
        )

    container = client.V1Container(
        name="nginx",
        image="nginx:latest",
        ports=[client.V1ContainerPort(container_port=80)],
        resources=client.V1ResourceRequirements(
            requests={"cpu": "100m", "memory": "64Mi"}
        ),
    )
    pod_spec = client.V1PodSpec(
        containers=[container],
        affinity=client.V1Affinity(node_affinity=node_affinity),
    )
    template = client.V1PodTemplateSpec(
        metadata=client.V1ObjectMeta(labels=labels),
        spec=pod_spec,
    )
    deployment = client.V1Deployment(
        metadata=client.V1ObjectMeta(name=request.name, labels=labels),
        spec=client.V1DeploymentSpec(
            replicas=request.replicas,
            selector=client.V1LabelSelector(match_labels={"app": request.name}),
            template=template,
        ),
    )
    try:
        try:
            apps.create_namespaced_deployment(namespace="default", body=deployment)
            action = "created"
        except ApiException as exc:
            if exc.status != 409:
                raise
            apps.patch_namespaced_deployment(name=request.name, namespace="default", body=deployment)
            action = "updated"
        return {
            "message": f"Deployment {request.name} {action}",
            "deployment": request.name,
            "replicas": request.replicas,
            "hardware": request.hardware,
            "affinity": request.affinity,
        }
    except ApiException as exc:
        raise HTTPException(status_code=exc.status or 500, detail=exc.body or exc.reason)

@app.delete("/api/workloads/{name}")
def delete_workload(name: str):
    load_cluster_config()
    try:
        client.AppsV1Api().delete_namespaced_deployment(
            name=name,
            namespace="default",
            propagation_policy="Foreground",
        )
        return {"message": f"Deployment {name} deletion requested"}
    except ApiException as exc:
        raise HTTPException(status_code=exc.status or 500, detail=exc.body or exc.reason)

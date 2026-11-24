# Kubernetes Pod Scheduling Using Node Affinity

## 1. Aim

To understand and implement Kubernetes Node Affinity for scheduling Pods onto suitable worker nodes based on custom node labels. The experiment also demonstrates how Kubernetes behaves when node labels are removed after Pods have already been scheduled.

## 2. Objectives

- Understand Kubernetes node labels and node affinity.
- Configure worker nodes with different hardware-category labels.
- Implement required and preferred node affinity.
- Observe Pod scheduling decisions.
- Understand the difference between scheduling-time constraints and execution-time behavior.
- Verify whether existing Pods continue running after their node labels are removed.

## 3. Technologies Used

- Docker Desktop
- Kubernetes
- Kind (Kubernetes in Docker)
- kubectl
- YAML
- React and FastAPI (optional dashboard integration)

## 4. Cluster Architecture

The experiment uses a Kind cluster containing one control-plane node and three worker nodes.

| Node | Hardware Label | Intended Workload |
|---|---|---|
| node-affinity-lab-control-plane | Default | Cluster management |
| node-affinity-lab-worker | high-cpu | CPU-intensive workloads |
| node-affinity-lab-worker2 | high-memory | Memory-intensive workloads |
| node-affinity-lab-worker3 | standard | General-purpose workloads |

**Note:** These hardware categories are custom labels used for scheduling demonstrations. They do not create or guarantee actual hardware differences between nodes.

## 5. Experiment 1: Configure Node Labels

Assign custom labels to worker nodes.

```powershell
kubectl label node node-affinity-lab-worker hardware=high-cpu

kubectl label node node-affinity-lab-worker2 hardware=high-memory

kubectl label node node-affinity-lab-worker3 hardware=standard
```

Verify the labels:

```powershell
kubectl get nodes -L hardware
```

## 6. Experiment 2: Required Node Affinity

Required node affinity ensures that a Pod is scheduled only on a node matching the specified conditions.

Example YAML:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: app
spec:
  replicas: 2
  selector:
    matchLabels:
      app: affinity-demo
  template:
    metadata:
      labels:
        app: affinity-demo
    spec:
      affinity:
        nodeAffinity:
          requiredDuringSchedulingIgnoredDuringExecution:
            nodeSelectorTerms:
              - matchExpressions:
                  - key: hardware
                    operator: In
                    values:
                      - high-cpu
      containers:
        - name: nginx
          image: nginx:latest
```

Apply the configuration:

```powershell
kubectl apply -f deployment.yaml
```

Verify Pod placement:

```powershell
kubectl get pods -o wide
```

**Observation:** Pods are scheduled only on nodes with the `hardware=high-cpu` label.

### Test an unavailable label

Change the required affinity value to `high-gpu`, which is not assigned to any worker node.

Apply the updated configuration and check:

```powershell
kubectl get pods -o wide
```

**Observation:** New Pods remain in the `Pending` state because no eligible node matches the required affinity.

## 7. Experiment 3: Preferred Node Affinity

Preferred node affinity expresses a scheduling preference rather than a strict requirement.

Example configuration:

```yaml
affinity:
  nodeAffinity:
    preferredDuringSchedulingIgnoredDuringExecution:
      - weight: 100
        preference:
          matchExpressions:
            - key: hardware
              operator: In
              values:
                - high-gpu
```

**Observation:** If no node matches `high-gpu`, Kubernetes can still schedule Pods on another eligible node. The preference does not guarantee placement on a matching node.

## 8. Experiment 4: Remove Node Labels

This experiment demonstrates what happens when node labels are removed after Pods have already been scheduled.

### Step 1: Verify existing Pods

```powershell
kubectl get pods -o wide
```

Record the nodes on which the Pods are running.

### Step 2: Remove worker-node labels

```powershell
kubectl label node node-affinity-lab-worker hardware-

kubectl label node node-affinity-lab-worker2 hardware-

kubectl label node node-affinity-lab-worker3 hardware-
```

### Step 3: Verify label removal

```powershell
kubectl get nodes -L hardware
```

### Step 4: Check existing Pods

```powershell
kubectl get pods -o wide
```

**Observation:** Existing Pods continue running on their previously assigned nodes even after the matching hardware labels are removed.

### Step 5: Create a new Pod with required affinity

Create or update a Deployment with:

```yaml
requiredDuringSchedulingIgnoredDuringExecution:
  nodeSelectorTerms:
    - matchExpressions:
        - key: hardware
          operator: In
          values:
            - high-cpu
```

Check the Pod status:

```powershell
kubectl get pods -o wide
```

**Observation:** Newly created Pods remain `Pending` because no node currently has the required label.

## 9. Results and Observations

| Experiment | Expected Result |
|---|---|
| Required affinity with matching label | Pod gets scheduled on a matching node |
| Required affinity without matching label | Pod remains Pending |
| Preferred affinity with matching label | Matching node is preferred |
| Preferred affinity without matching label | Pod can schedule on another eligible node |
| Remove label after Pod scheduling | Existing Pod continues running |
| Create a new Pod after label removal | Required-affinity Pod remains Pending |

## 10. Key Learning Outcomes

1. Node labels are used to classify and identify Kubernetes nodes.
2. Node affinity provides greater flexibility than basic node selection.
3. Required affinity enforces scheduling constraints.
4. Preferred affinity provides soft scheduling preferences.
5. The `IgnoredDuringExecution` behavior means changes to node labels do not automatically evict already-running Pods.
6. Kubernetes evaluates scheduling constraints when selecting a node for a newly scheduled Pod.

## 11. Conclusion

The experiment successfully demonstrates Kubernetes Node Affinity using custom node labels. Required and preferred affinity were implemented to observe different scheduling behaviours. The label-removal experiment further demonstrated that existing Pods continue running even when their matching node labels are removed, while newly created Pods with unmet required affinity remain Pending.

This experiment provides practical understanding of Kubernetes scheduling decisions and the distinction between scheduling-time constraints and execution-time behaviour.


## 12.team-05
1. Pradeep Bichagatti
2. Bhavana B h
3. Zakiya Tahasildar
4. Abhinandan Belagavi
    

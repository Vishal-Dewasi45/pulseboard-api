import Activity from "../models/activity.js";

const CreateActivity= async ({
    workspace,
    project = null,
    task = null,
    actor,
    action,
    message,
    metadata = {},
})=>{
    return Activity.create({
        workspace,
        project,
        task,
        actor,
        action,
        message,
        metadata,
    })
}

export default CreateActivity;
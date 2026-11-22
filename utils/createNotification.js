import Notification from "../models/notification.js";
import { getIO } from "../socket.js";

const createNotification = async ({
    recipient,
    actor,
    workspace,
    project=null,
    task=null,
    type,
    title,
    message,
})=>{
    const notification= await Notification.create({
        recipient,
        actor,
        workspace,
        project,
        task,
        type,
        title,
        message,
    })

    getIO()
    .to(`user:${recipient.toString()}`)
    .emit("notification:new",notification);

    return notification;
}

export default createNotification;
